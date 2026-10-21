import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayerView, Tile as TileCode } from '@mahjong/engine';
import { Tile, TileGroup } from '../components/Tile.tsx';
import { Icon, Plate, WIND_ZH, roundLabel } from '../components/ui.tsx';
import { act, getState, onView, send, useApp } from '../lib/store.ts';
import { sound } from '../lib/sound.ts';
import { valueLabel } from '../lib/mode.ts';
import { PlayerAid } from '../components/PlayerAid.tsx';
import { computeLayout, type Insets } from './layout.ts';
import { MahjongScene, type Anchors, type TableState } from '../three/scene.ts';

const EMOTES = ['👍', '😂', '😮', '😭', '😡', '🍀', '🀄'];
const CLAIM_LABEL: Record<string, string> = { pung: 'Pung !', kong: 'Kong !', chow: 'Chow !' };

/** Safe-area insets (notch, home bar) read from CSS. */
function useInsets(): Insets {
  const [ins, setIns] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const read = () => {
      const cs = getComputedStyle(probe);
      setIns({ top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 });
    };
    read();
    window.addEventListener('resize', read);
    return () => { window.removeEventListener('resize', read); probe.remove(); };
  }, []);
  return ins;
}

function useViewport() {
  const [size, setSize] = useState({ W: window.innerWidth, H: window.innerHeight });
  useEffect(() => {
    let t: number;
    const on = () => { clearTimeout(t); t = window.setTimeout(() => setSize({ W: window.innerWidth, H: window.innerHeight }), 80); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function Table({ view: v }: { view: PlayerView }) {
  const app = useApp();
  const room = app.room!;
  const ins = useInsets();
  const { W, H } = useViewport();
  const lay = useMemo(() => computeLayout(W, H, ins), [W, H, ins]);
  const me = v.me.seat;
  const rel = (s: number) => (s - me + 4) % 4;
  const at = (r: number) => (me + r) % 4;
  const name = (s: number) => (s === me ? 'Vous' : v.seats[s].name);
  const wide = W >= 1000;

  const [selected, setSelected] = useState<number | 'drawn' | null>(null);
  const [banners, setBanners] = useState<{ id: number; rel: number | null; text: string; win?: boolean }[]>([]);
  const [emotePicker, setEmotePicker] = useState(false);
  const lastActions = useRef('');
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MahjongScene | null>(null);
  const tapRef = useRef<(i: number) => void>(() => {});
  const [anc, setAnc] = useState<Anchors | null>(null);

  // The 3D scene lives as long as the game; its canvas is created here (one per mount).
  useEffect(() => {
    const c = document.createElement('canvas');
    c.className = 'table3d';
    host.current!.appendChild(c);
    const sc = new MahjongScene(c);
    scene.current = sc;
    sc.onHandTap = (i) => tapRef.current(i);
    sc.onFrame = setAnc;
    (window as unknown as { __mjScene: unknown }).__mjScene = sc; // for automated tests
    const fit = () => sc.resize(c.clientWidth, c.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => { ro.disconnect(); sc.dispose(); c.remove(); scene.current = null; };
  }, []);

  const myTurn = v.phase === 'turn' && v.turn === me;
  useEffect(() => { if (!myTurn) setSelected(null); }, [myTurn, v.handNo]);

  // Sounds and announcements on every new event
  useEffect(() => onView((prev, next) => {
    const e = next.lastEvent;
    if (!prev || !e || (prev.lastEvent && e.seq <= prev.lastEvent.seq)) return;
    const r = e.seat === undefined ? null : (e.seat - getState().room!.seat + 4) % 4;
    const push = (text: string, win = false) => {
      const id = e.seq;
      setBanners((b) => [...b, { id, rel: r, text, win }]);
      setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 1400);
    };
    if (e.type === 'discard') sound.discard();
    else if (e.type === 'flower' || e.type === 'deal') sound.tap();
    else if (e.type === 'claim') { sound.claim(); push(CLAIM_LABEL[e.claim!]); }
    else if (e.type === 'addkong') { sound.claim(); push('Kong ?'); }
    else if (e.type === 'win') { sound.win(); push('Mahjong !', true); }
    else if (e.type === 'exhaust') { sound.exhaust(); push('Mur épuisé'); }
    const mine = getState().room!.seat;
    if (next.phase === 'turn' && next.turn === mine && !(prev.phase === 'turn' && prev.turn === mine)) {
      sound.yourTurn();
      navigator.vibrate?.(25);
    }
  }), []);

  // Timer ring and claim bar, updated every frame
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { deadline, view } = getState();
      if (view) {
        const p = Math.max(0, Math.min(1, (deadline - performance.now()) / (view.totalMs || 1)));
        document.querySelectorAll<HTMLElement>('[data-ring]').forEach((el) => el.style.setProperty('--p', String(p)));
        const bar = document.getElementById('claim-timer');
        if (bar) bar.style.transform = `scaleX(${p})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const isActive = (s: number) => v.focus === s && v.phase !== 'end' && v.phase !== 'over';
  const hand = v.me.hand;
  const selTile: TileCode | null = selected === 'drawn' ? v.me.drawn : selected !== null ? hand[selected] ?? null : null;
  const readyDiscards = v.me.hints?.discards ?? {};

  const discard = (t: TileCode) => { act({ type: 'discard', tile: t }); setSelected(null); };
  const tapTile = (key: number | 'drawn', t: TileCode) => {
    if (!myTurn) return;
    if (selected === key) { discard(t); return; }
    sound.tap();
    setSelected(key);
  };

  const showAll = v.phase === 'end' || v.phase === 'over';
  const mode = v.settings.mode;

  // Your hand in the scene: hand tiles, then the drawn tile set apart.
  const myTiles = v.me.drawn ? [...hand, v.me.drawn] : hand;
  tapRef.current = (i) => {
    if (v.me.drawn && i === hand.length) tapTile('drawn', v.me.drawn);
    else if (hand[i]) tapTile(i, hand[i]);
  };
  const tableState = useMemo<TableState>(() => ({
    seats: [0, 1, 2, 3].map((r) => {
      const s = at(r), p = v.seats[s];
      const base = {
        discards: p.discards, melds: p.melds.map((m) => ({ tiles: m.tiles as string[], claimed: m.claimed })),
        flowers: p.flowers, standing: p.handCount, justDrew: p.justDrew,
        revealed: showAll && r !== 0 ? p.revealed : undefined,
      };
      if (r !== 0) return base;
      return {
        ...base, hand: myTiles, justDrew: !!v.me.drawn,
        selected: selected === 'drawn' ? hand.length : selected ?? undefined,
        ready: myTurn ? myTiles.map((t) => !!readyDiscards[t]) : undefined,
      };
    }),
    focus: showAll || v.focus === null ? -1 : rel(v.focus),
    lastDiscard: v.lastDiscard ? rel(v.lastDiscard.seat) : -1,
    wallCount: v.wallCount, dice: v.wall.dice,
    winds: [0, 1, 2, 3].map((r) => WIND_ZH[v.seats[at(r)].wind]),
    dealer: rel(v.dealer),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [v, selected, myTurn]);
  useEffect(() => { scene.current?.update(tableState); }, [tableState]);

  /* ---------------- Actions ---------------- */
  let actions: React.ReactNode = null;
  const claim = v.me.claim;
  if (myTurn && v.me.turn) {
    const o = v.me.turn;
    actions = (
      <>
        {o.tsumo && !o.tsumo.tooLow && <button className="act win" onClick={() => act({ type: 'tsumo' })}>Mahjong ! <small>{valueLabel(mode, o.tsumo.fan)}</small></button>}
        {o.kongs?.map((k) => <button key={k.tile + k.kind} className="act kong" onClick={() => act({ type: 'kong', tile: k.tile })}>Kong <TileGroup tiles={[k.tile]} w={20} /></button>)}
        {selTile && readyDiscards[selTile] && <Waits label="En la jetant, vous attendrez" list={readyDiscards[selTile]} />}
        {!selTile && o.tsumo?.tooLow && <span className="tip">Main complète, mais {valueLabel(mode, o.tsumo.base ?? o.tsumo.fan)} sur {mode === 'mcr' ? '8 (fleurs non comptées)' : v.settings.minFan} requis</span>}
        {!selTile && !o.tsumo?.tooLow && v.handNo === 1 && v.seats[me].discards.length < 3 && <span className="tip">Touchez une tuile pour la lever, touchez-la encore pour la jeter</span>}
      </>
    );
  } else if (claim) {
    actions = (
      <>
        <div className="claim-row"><div className="claim-card">
          <span>{name(claim.from)} {claim.robbing ? 'complète un kong' : 'jette'}</span>
          <Tile t={claim.tile} w={32} />
          <span className="timer"><i id="claim-timer" /></span>
        </div></div>
        {claim.win && <button className="act win" onClick={() => act({ type: 'claim', kind: 'win' })}>Mahjong ! <small>{valueLabel(mode, claim.win.fan)}</small></button>}
        {claim.kong && <button className="act kong" onClick={() => act({ type: 'claim', kind: 'kong' })}>Kong <TileGroup tiles={[claim.tile, claim.tile, claim.tile, claim.tile]} w={18} /></button>}
        {claim.pung && <button className="act" onClick={() => act({ type: 'claim', kind: 'pung' })}>Pung <TileGroup tiles={[claim.tile, claim.tile, claim.tile]} w={18} /></button>}
        {claim.chows?.map((c, i) => {
          const seq = [...c, claim.tile].sort((a, b) => Number(a[1]) - Number(b[1]));
          return <button key={i} className="act chow" onClick={() => act({ type: 'claim', kind: 'chow', tiles: c })}>Chow <TileGroup tiles={seq} w={18} highlight={claim.tile} /></button>;
        })}
        <button className="act pass" onClick={() => act({ type: 'claim', kind: 'pass' })}>Passer</button>
      </>
    );
  } else if (v.me.waitingForOthers) {
    actions = <span className="tip">Les autres réfléchissent…</span>;
  } else if (v.me.hints?.waits?.length && v.phase !== 'end') {
    actions = <Waits label="Vous attendez" list={v.me.hints.waits} />;
  }
  const actionsKey = claim ? `c${v.version}-${claim.tile}` : myTurn ? `t${v.handNo}-${v.seats[me].discards.length}-${selTile}` : '';
  const calm = actionsKey === lastActions.current;
  useEffect(() => { lastActions.current = actionsKey; });


  return (
    <div className="table" style={{ ['--k' as string]: lay.k }}>
      {/* Top bar */}
      <div className="hud" style={{ left: lay.L, top: lay.T }}>
        <button className="icon-btn" aria-label="Menu" onClick={() => window.dispatchEvent(new CustomEvent('mj:menu'))}>{Icon.menu}</button>
        <div className="round-chip">
          <span className="zh">{WIND_ZH[v.roundWind]}</span>
          {wide
            ? <span>{roundLabel(v.roundWind)} <small>main {v.handNo}{v.dealerStreak ? `, donneur ×${v.dealerStreak + 1}` : ''}</small></span>
            : <span>Main {v.handNo}</span>}
        </div>
      </div>
      <div className="hud" style={{ right: W - lay.R, top: lay.T }}>
        {wide && <span className="round-chip" style={{ paddingLeft: 12 }}><small>Table</small> {room.code}</span>}
        <button className="icon-btn" aria-label="Réactions" onClick={() => setEmotePicker((x) => !x)}>{Icon.smile}</button>
      </div>
      {emotePicker && (
        <div className="emote-picker" style={{ right: W - lay.R, top: lay.T + 46 * lay.k }}>
          {EMOTES.map((e) => <button key={e} onClick={() => { send({ t: 'emote', e }); setEmotePicker(false); }}>{e}</button>)}
        </div>
      )}

      {/* The 3D table, in the background: it fills the screen */}
      <div ref={host} className="table3d-host" />

      {/* Player plates, at a fixed size next to their table edge */}
      {anc && [0, 1, 2, 3].map((r) => {
        const s = at(r);
        const p = v.seats[s];
        const pt = clampPt(anc.plate[r], W, H, r === 2 ? 110 : 58, r === 2 ? 36 : 60);
        return (
          <div key={r} className="seat-plate" style={{ left: pt.x, top: pt.y }}>
            <Plate seat={s} s={p} me={r === 0} dealer={v.dealer === s} active={isActive(s)} size={r === 0 ? 42 : 40} column={r !== 2}
              extra={r !== 0 && !showAll && <span className="chip" title="Tuiles en main">{p.handCount}</span>} />
          </div>
        );
      })}

      {/* Choices (claim, mahjong, kong) right above your hand */}
      <div className={`actions bottom ${calm ? 'calm' : ''}`} style={{ left: lay.L, width: lay.R - lay.L, bottom: H - (anc ? anc.handTop : H - 150) + 8 }}>
        {actions}
      </div>

      {/* Player aid, bottom right */}
      <PlayerAid v={v} bottom={anc ? Math.max(70, H - anc.handTop + 10) : undefined} onRules={() => window.dispatchEvent(new CustomEvent('mj:rules'))} />

      {/* Announcements and reactions */}
      {banners.map((b) => {
        if (!anc) return null;
        const p = b.rel === null ? anc.center : anc.banner[b.rel];
        return <div key={b.id} className={`banner ${b.win ? 'win' : ''}`} style={{ left: p.x, top: p.y }}>{b.text}</div>;
      })}
      {app.emotes.map((e) => {
        const r = rel(e.seat);
        if (!anc) return null;
        const q = clampPt(anc.plate[r], W, H, 44, 56);
        const p = { x: q.x, y: q.y - 60 };
        return <div key={e.id} className="emote" style={{ left: p.x, top: p.y }}>{e.e}</div>;
      })}
    </div>
  );
}

/** Keeps an anchor point on screen, with a margin (half width, half height of the plate). */
function clampPt(p: { x: number; y: number }, W: number, H: number, mx: number, my: number) {
  return { x: Math.min(W - mx, Math.max(mx, p.x)), y: Math.min(H - my, Math.max(my, p.y)) };
}

function Waits({ label, list }: { label: string; list: { tile: TileCode; left: number }[] }) {
  return (
    <span className="tip waits">
      {label}
      {list.map((w) => (
        <span key={w.tile} className="w"><Tile t={w.tile} w={17} /><small>×{w.left}</small></span>
      ))}
    </span>
  );
}
