/**
 * 3D table prototype: a demo hand, no server.
 * Open /proto.html. The buttons discard a tile, make the others play, or claim a pung.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TILE_SPRITE } from '../components/tileArt.ts';
import { MahjongScene, type TableState } from '../three/scene.ts';
import '../styles.css';

const POOLS = [
  ['z4', 'm9', 'p1', 's9', 'z3', 'm1', 'p9', 's1', 'm8'],
  ['z3', 'p9', 'm1', 's2', 'z6', 'p2', 'm7', 's4', 'p4', 'z2', 'm6'],
  ['z4', 's1', 'p8', 'm9', 'z7', 's3', 'p3', 'm5', 's8', 'p6'],
  ['m1', 'z3', 'p1', 's9', 'm2', 'z6', 'p5', 's5', 'm8', 's2'],
];
const NEXT = ['s7', 'p3', 'm6', 'z5', 'p8', 'm4', 's9', 'z1', 'p2', 'm3', 's5', 'p7'];

function initial(): TableState {
  return {
    seats: [
      { discards: POOLS[0].slice(), melds: [], flowers: [], standing: 0, justDrew: false },
      { discards: POOLS[1].slice(), melds: [], flowers: ['f3'], standing: 13, justDrew: false },
      { discards: POOLS[2].slice(), melds: [{ tiles: ['s3', 's4', 's5'], claimed: 's4' }], flowers: ['f2'], standing: 10, justDrew: false },
      { discards: POOLS[3].slice(), melds: [{ tiles: ['z5', 'z5', 'z5'], claimed: 'z5' }], flowers: ['f1', 'f5'], standing: 10, justDrew: false },
    ],
    focus: 0, lastDiscard: 3, wallCount: 67, dice: [3, 5, 2], winds: ['東', '南', '西', '北'], dealer: 0,
  };
}

function Proto() {
  const canvas = useRef<HTMLDivElement>(null);
  const scene = useRef<MahjongScene | null>(null);
  const [st, setSt] = useState<TableState>(initial);
  const [hand, setHand] = useState(['m2', 'm3', 'm4', 'm9', 'p5', 'p6', 'p7', 'p7', 's6', 's7', 's8', 'z2', 'z2', 's7']);
  const [sel, setSel] = useState<number | null>(null);
  const [drew, setDrew] = useState(true);
  const n = useRef(0);
  const tap = useRef<(i: number) => void>(() => {});
  tap.current = (i) => (sel === i ? discard(i) : setSel(i));

  useEffect(() => {
    const c = document.createElement('canvas');
    c.className = 'table3d';
    canvas.current!.appendChild(c);
    const sc = new MahjongScene(c);
    scene.current = sc;
    sc.onHandTap = (i) => tap.current(i);
    const onResize = () => requestAnimationFrame(() => sc.resize(c.clientWidth, c.clientHeight));
    onResize();
    window.addEventListener('resize', onResize);
    (window as unknown as { __proto: unknown }).__proto = { ready: true, point: (i: number) => sc.handPoint(i) };
    return () => { window.removeEventListener('resize', onResize); sc.dispose(); c.remove(); };
  }, []);
  useEffect(() => {
    const seats = st.seats.map((x, r) => (r === 0 ? { ...x, hand, selected: sel ?? undefined, justDrew: drew } : x));
    scene.current?.update({ ...st, seats });
  }, [st, hand, sel, drew]);

  const draw = () => NEXT[n.current++ % NEXT.length];
  const discard = (i: number) => {
    const t = hand[i];
    const rest = hand.filter((_, j) => j !== i);
    setHand(rest.sort());
    setDrew(false);
    setSel(null);
    setSt((s) => {
      const seats = s.seats.map((x) => ({ ...x, discards: x.discards.slice() }));
      seats[0].discards.push(t);
      return { ...s, seats, lastDiscard: 0, focus: 1, wallCount: s.wallCount - 1 };
    });
  };
  const others = () => {
    // The three others play in turn, with a short delay.
    [1, 2, 3].forEach((r, i) => setTimeout(() => setSt((s) => {
      const seats = s.seats.map((x) => ({ ...x, discards: x.discards.slice() }));
      seats[r].discards.push(draw());
      return { ...s, seats, lastDiscard: r, focus: r === 3 ? 0 : r + 1, wallCount: s.wallCount - 1 };
    }), i * 700));
    setTimeout(() => { setHand((h) => (h.length === 13 ? [...h, draw()] : h)); setDrew(true); }, 2400);
  };
  const pung = () => setSt((s) => {
    // Wong (across) claims Mei's (right) last discard for a pung.
    const seats = s.seats.map((x) => ({ ...x, discards: x.discards.slice(), melds: x.melds.slice() }));
    const t = seats[1].discards.pop()!;
    seats[2].melds.push({ tiles: [t, t, t], claimed: t });
    seats[2].standing -= 2;
    return { ...s, seats, lastDiscard: -1, focus: 2 };
  });
  const reveal = () => setSt((s) => ({
    ...s, focus: -1, lastDiscard: -1,
    seats: s.seats.map((x, r) => (r === 0 ? x : { ...x, revealed: ['m1', 'm1', 'p4', 'p5', 'p6', 's2', 's3', 's4', 'z6', 'z6'].slice(0, x.standing) })),
  }));

  return (
    <div className="app">
      <div dangerouslySetInnerHTML={{ __html: TILE_SPRITE }} />
      <div ref={canvas} className="table3d-host" style={{ position: 'fixed' }} />
      <div className="hud" style={{ left: 12, top: 10 }}>
        <button className="btn small" onClick={others}>Les autres jouent</button>
        <button className="btn small" onClick={pung}>Wong fait pung</button>
        <button className="btn small" onClick={reveal}>Fin de main</button>
        <button className="btn small" onClick={() => setSt(initial())}>Recommencer</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Proto /></StrictMode>);
