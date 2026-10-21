import { useEffect, useState, type ReactNode } from 'react';
import { FAN_TABLE, MCR_FAN_TABLE, type FanItem, type Mode, type PlayerView, type RoomView } from '@mahjong/engine';
import { Tile, TileGroup } from '../components/Tile.tsx';
import { Avatar, Icon } from '../components/ui.tsx';
import { act, getState, leaveTable, send } from '../lib/store.ts';
import { sound } from '../lib/sound.ts';
import { MODE_NAMES, valueLabel } from '../lib/mode.ts';

export function Sheet({ children, narrow, onClose }: { children: ReactNode; narrow?: boolean; onClose?: () => void }) {
  return (
    <div className="sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`sheet ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Repeated fans (two terminal pungs, flowers…) shown on one line with a count. */
function groupItems(items: FanItem[]) {
  const out: { it: FanItem; n: number }[] = [];
  for (const it of items) {
    const g = out.find((x) => x.it.key === it.key);
    if (g) g.n++;
    else out.push({ it, n: 1 });
  }
  return out;
}

function Countdown() {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, []);
  return <small style={{ opacity: .8 }}>{Math.ceil(Math.max(0, getState().deadline - performance.now()) / 1000)} s</small>;
}

export function ResultSheet({ v, onHide }: { v: PlayerView; onHide: () => void }) {
  const r = v.result!;
  const me = v.me.seat;
  const name = (s: number) => (s === me ? 'Vous' : v.seats[s].name);
  const meReady = v.seats[me].ready;
  const others = v.seats.map((p, s) => ({ p, s })).filter(({ s }) => s !== r.winner && s !== me);
  let title: string, sub: string;
  if (r.type === 'win') {
    const w = r.winner!;
    title = w === me ? 'Vous gagnez !' : `${name(w)} gagne`;
    sub = r.selfDraw ? 'Mahjong en auto-pioche.'
      : r.items!.some((i) => i.key === 'robbingKong') ? `Mahjong en volant le kong de ${name(r.from!)}.`
      : `Mahjong sur la défausse de ${name(r.from!)}.`;
  } else {
    title = 'Mur épuisé';
    sub = v.settings.mode === 'mcr' ? 'Personne ne gagne cette main.' : 'Personne ne gagne cette main. Le donneur reste le même.';
  }
  const mode = v.settings.mode;
  const flowers = r.items?.filter((i) => i.key === 'flowerTiles').length ?? 0;
  return (
    <Sheet>
      <h2>{title}</h2>
      <p className="sub">{sub}</p>
      <div className="sheet-cols">
        <div>
          {r.type === 'win' && r.winningHand && (
            <>
              <div className="win-hand">
                {r.winningHand.melds.map((m, i) => <TileGroup key={i} tiles={m.tiles} w={26} />)}
                <TileGroup tiles={r.winningHand.concealed} w={26} />
                <Tile t={r.tile!} w={26} className="win" />
                {r.winningHand.flowers.length > 0 && <TileGroup tiles={r.winningHand.flowers} w={24} />}
              </div>
              <ul className="fans">
                {groupItems(r.items!).map(({ it, n }) => (
                  <li key={it.key}>
                    <span>{it.name}{n > 1 && <small> ×{n}</small>}<span className="zh">{it.zh}</span></span>
                    <span className="f">{it.limit ? 'Limite' : it.fan * n}</span>
                  </li>
                ))}
              </ul>
              {mode === 'mcr' ? (
                <div className="fan-total">
                  <span>{valueLabel('mcr', r.fan!)}{flowers > 0 && <small> dont {flowers} de fleurs</small>}</span>
                  <span>{r.selfDraw ? `8 + ${r.fan} par joueur` : `${name(r.from!)} paie 8 + ${r.fan}, les autres 8`}</span>
                </div>
              ) : (
                <div className="fan-total">
                  <span>{r.limit ? 'Main limite' : valueLabel('hk', r.fan!)}</span>
                  <span>{r.selfDraw ? `${r.points} pts par joueur` : `${r.points! * 2} pts`}</span>
                </div>
              )}
            </>
          )}
          {r.type === 'draw' && (
            <details className="more" open>
              <summary>Les mains de chacun</summary>
              {v.seats.map((p, s) => <div className="rh" key={s}><b>{name(s)}</b><TileGroup tiles={p.revealed ?? []} w={20} /></div>)}
            </details>
          )}
        </div>
        <div>
          <div className="scores">
            {v.seats.map((p, s) => (
              <div className="score" key={s}>
                <Avatar name={p.name} isBot={p.isBot} />
                <span className="n">{name(s)}</span>
                <span className={`d ${r.deltas[s] > 0 ? 'pos' : r.deltas[s] < 0 ? 'neg' : ''}`}>{signed(r.deltas[s])}</span>
                <span className="t">{p.score}</span>
                <span className={`rdy ${p.ready ? 'on' : ''}`} title={p.ready ? 'Prêt' : 'Pas encore prêt'} />
              </div>
            ))}
          </div>
          {r.type === 'win' && (
            <details className="more">
              <summary>Voir les mains des autres</summary>
              {others.map(({ p, s }) => <div className="rh" key={s}><b>{name(s)}</b><TileGroup tiles={p.revealed ?? []} w={20} /></div>)}
            </details>
          )}
          <div className="row sheet-actions">
            <button className="btn gold grow" disabled={meReady} onClick={() => act({ type: 'ready' })}>
              {meReady ? 'En attente des autres…' : r.gameEnds ? 'Voir le classement' : 'Main suivante'} <Countdown />
            </button>
            <button className="btn" onClick={onHide}>Voir la table</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function GameOverSheet({ v, room }: { v: PlayerView; room: RoomView }) {
  const me = v.me.seat;
  const name = (s: number) => (s === me ? 'Vous' : v.seats[s].name);
  const ranked = v.seats.map((p, s) => ({ ...p, s })).sort((a, b) => b.score - a.score);
  const order = [ranked[1], ranked[0], ranked[2]];
  const heights = [70, 104, 50];
  return (
    <Sheet>
      <h2>{ranked[0].s === me ? 'Vous remportez la partie !' : `${ranked[0].name} remporte la partie`}</h2>
      <p className="sub">{v.history.length} mains jouées.</p>
      <div className="podium">
        {order.map((p, i) => (
          <div key={p.s} className={`p ${i === 1 ? 'first' : ''}`}>
            <Avatar name={p.name} isBot={p.isBot} />
            <span className="nm">{name(p.s)}</span>
            <span className="pts">{p.score} pts</span>
            <div className="block" style={{ height: heights[i] }}>{[2, 1, 3][i]}</div>
          </div>
        ))}
      </div>
      <p className="sub center-text">4e : {name(ranked[3].s)}, {ranked[3].score} pts</p>
      <details className="more">
        <summary>Détail des mains</summary>
        <ul>
          {v.history.map((h) => (
            <li key={h.handNo}>Main {h.handNo} : {h.type === 'win'
              ? `${name(h.winner!)} ${h.from == null ? 'en auto-pioche' : `sur ${name(h.from)}`}, ${valueLabel(v.settings.mode, h.fan!)}`
              : 'mur épuisé'}</li>
          ))}
        </ul>
      </details>
      <div className="row" style={{ marginTop: 14 }}>
        {room.youAreHost
          ? <button className="btn gold grow" onClick={() => send({ t: 'rematch' })}>Rejouer</button>
          : <p className="sub grow">L’hôte peut relancer une partie.</p>}
        <button className="btn" onClick={() => leaveTable()}>Quitter</button>
      </div>
    </Sheet>
  );
}

export function MenuSheet({ onClose, onRules }: { onClose: () => void; onRules: () => void }) {
  const [muted, setMuted] = useState(sound.muted);
  const [confirmLeave, setConfirmLeave] = useState(false);
  return (
    <Sheet narrow onClose={onClose}>
      <h2>Pause</h2>
      <p className="sub">Table {getState().room?.code}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="btn block" onClick={onRules}>Règles et combinaisons</button>
        <button className="btn block" onClick={() => setMuted(sound.toggle())}>
          <span style={{ width: 22, display: 'inline-grid' }}>{muted ? Icon.mute : Icon.sound}</span>{muted ? 'Son coupé' : 'Son activé'}
        </button>
        {confirmLeave ? (
          <div className="confirm">
            <p>Quitter la table ? Un bot prendra votre place.</p>
            <div className="row">
              <button className="btn small grow" onClick={() => setConfirmLeave(false)}>Rester</button>
              <button className="btn small grow danger" onClick={() => { onClose(); leaveTable(); }}>Quitter</button>
            </div>
          </div>
        ) : <button className="btn block" onClick={() => setConfirmLeave(true)}>Quitter la table</button>}
        <button className="btn gold block" onClick={onClose}>Reprendre</button>
      </div>
    </Sheet>
  );
}

export function RulesSheet({ onClose, mode: initial }: { onClose: () => void; mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial ?? 'hk');
  return (
    <Sheet onClose={onClose}>
      <div className="rules">
        <div className="rules-head">
          <h2>Comment jouer</h2>
          <div className="seg" role="group" aria-label="Règles">
            {(['hk', 'mcr'] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_NAMES[m]}</button>
            ))}
          </div>
        </div>
        <div className="sheet-cols">
          <div>
            <p>Chacun commence avec 13 tuiles. À votre tour, vous piochez une tuile puis vous en jetez une.
              Le but : réunir <b>4 combinaisons et 1 paire</b>.</p>
            <div className="examples">
              <span><TileGroup tiles={['m3', 'm4', 'm5']} w={26} /><small>Chow : une suite</small></span>
              <span><TileGroup tiles={['z5', 'z5', 'z5']} w={26} /><small>Pung : un brelan</small></span>
              <span><TileGroup tiles={['p8', 'p8']} w={26} /><small>La paire</small></span>
            </div>
            <h3>Prendre une tuile jetée</h3>
            <ul>
              <li><b>Chow</b> : seulement sur la tuile du joueur à votre gauche.</li>
              <li><b>Pung</b> ou <b>Kong</b> (4 identiques) : sur la tuile de n’importe qui. Passe avant le chow.</li>
              <li><b>Mahjong</b> : si la tuile complète votre main. Passe avant tout ; à égalité, le premier dans l’ordre de jeu gagne.</li>
            </ul>
            {mode === 'hk' ? (
              <>
                <h3>Les fleurs</h3>
                <p>Fleurs et saisons sont posées dès qu’on les pioche, et remplacées. Celle qui porte le numéro de votre place (Est 1, Sud 2, Ouest 3, Nord 4) rapporte 1 fan.</p>
                <h3>Les points</h3>
                <p>Il faut atteindre le minimum de fans de la table pour déclarer mahjong. Sur une tuile jetée, celui qui l’a jetée paie le double. En auto-pioche, les trois autres paient.
                  Le donneur garde la main s’il gagne ou si le mur est épuisé.</p>
              </>
            ) : (
              <>
                <h3>8 points minimum</h3>
                <p>Une main ne gagne que si ses combinaisons valent <b>au moins 8 points</b>. Les fleurs rapportent 1 point chacune, mais ne comptent pas pour ce minimum.
                  Une main qui n’a aucune combinaison vaut 8 points.</p>
                <h3>Mains spéciales</h3>
                <p>En plus de 4 combinaisons et 1 paire : sept paires, treize orphelins, et les mains « tissées » (1-4-7, 2-5-8 et 3-6-9 dans trois familles différentes).</p>
                <h3>Ce qui ne se cumule pas</h3>
                <p>Une combinaison déjà incluse dans une plus grande ne compte pas (par exemple, une couleur pure ne compte pas « sans honneur »).
                  Pour les combinaisons de plusieurs suites ou pungs, chaque nouvelle combinaison doit utiliser au moins une suite ou un pung pas encore comptés.</p>
                <h3>Les paiements</h3>
                <p>Chacun paie 8 points au gagnant. Celui qui a jeté la tuile paie en plus la valeur de la main ; en auto-pioche, les trois autres la paient.
                  Le donneur change à chaque main : un tour, ce sont 4 mains.</p>
              </>
            )}
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Les combinaisons</h3>
            {mode === 'hk' ? (
              <table><tbody>
                {FAN_TABLE.map((f) => <tr key={f.key}><td>{f.name}<span className="zh">{f.zh}</span></td><td>{f.fan}</td></tr>)}
              </tbody></table>
            ) : (
              <table><tbody>
                {MCR_FAN_TABLE.map((f) => <tr key={f.key}><td>{f.name}<span className="zh">{f.zh}</span></td><td>{f.fan}</td></tr>)}
              </tbody></table>
            )}
          </div>
        </div>
        <button className="btn gold block" style={{ marginTop: 16 }} onClick={onClose}>Compris</button>
      </div>
    </Sheet>
  );
}
