/**
 * In-game player aid, like the reference cards of board games: a button at the bottom right opens a
 * dark panel with three tabs. "Combinations" lists the hands worth aiming for, "For my hand" reads
 * the current hand and shows the closest targets, "Rules" recalls the essentials of the table's rules.
 */
import { useMemo, useState } from 'react';
import { FAN_TABLE, MCR_FAN_TABLE, suggestTargets, type Mode, type PlayerView, type Target, type Tile as TileCode } from '@mahjong/engine';
import { Tile } from './Tile.tsx';

type Tab = 'combos' | 'hand' | 'rules';
const OPEN_KEY = 'mj2.aid';

interface Row { key: string; ex: TileCode[][]; note?: string; label?: string }
interface Section { title: string; rows: Row[] }

/** Hands worth knowing, per rule set. Names and values come from the engine's tables. */
const COMBOS: Record<Mode, { sections: Section[]; bonus: { key: string; label?: string }[] }> = {
  mcr: {
    sections: [
      { title: 'Valent 8 points ou plus', rows: [
        { key: 'mixedStraight', ex: [['m1', 'm2', 'm3'], ['p4', 'p5', 'p6'], ['s7', 's8', 's9']] },
        { key: 'mixedTripleChow', ex: [['m3', 'm4', 'm5'], ['p3', 'p4', 'p5'], ['s3', 's4', 's5']] },
        { key: 'pureStraight', ex: [['s1', 's2', 's3'], ['s4', 's5', 's6'], ['s7', 's8', 's9']], note: 'une seule famille' },
        { key: 'knittedStraight', ex: [['m1', 'm4', 'm7'], ['p2', 'p5', 'p8'], ['s3', 's6', 's9']], note: '+ 1 combinaison et 1 paire' },
        { key: 'sevenPairs', ex: [['m1', 'm1'], ['p4', 'p4'], ['s7', 's7'], ['z5', 'z5']], note: '× 7' },
        { key: 'fullFlush', ex: [['p2', 'p3', 'p4'], ['p6', 'p6', 'p6']], note: 'une famille, sans honneur' },
      ] },
      { title: '6 points : à compléter', rows: [
        { key: 'halfFlush', ex: [['m2', 'm3', 'm4'], ['z1', 'z1', 'z1']], note: 'une famille + honneurs' },
        { key: 'allPungs', ex: [['p2', 'p2', 'p2'], ['s5', 's5', 's5'], ['z6', 'z6', 'z6']] },
        { key: 'allTypes', ex: [['m5'], ['p5'], ['s5'], ['z2'], ['z5']], note: 'les 5 sortes' },
        { key: 'mixedShiftedChows', ex: [['m1', 'm2', 'm3'], ['p2', 'p3', 'p4'], ['s3', 's4', 's5']] },
      ] },
    ],
    bonus: [{ key: 'concealedHand' }, { key: 'allChows' }, { key: 'dragonPung' }, { key: 'allSimples' }, { key: 'selfDrawn' }, { key: 'singleWait', label: 'Attente unique' }],
  },
  hk: {
    sections: [
      { title: 'Les grosses mains', rows: [
        { key: 'bigDragons', ex: [['z5', 'z5', 'z5'], ['z6', 'z6', 'z6'], ['z7', 'z7', 'z7']] },
        { key: 'fullFlush', ex: [['p2', 'p3', 'p4'], ['p6', 'p6', 'p6']], note: 'une famille, sans honneur' },
        { key: 'smallWinds', ex: [['z1', 'z1', 'z1'], ['z2', 'z2', 'z2'], ['z3', 'z3', 'z3'], ['z4', 'z4']] },
        { key: 'smallDragons', ex: [['z5', 'z5', 'z5'], ['z6', 'z6', 'z6'], ['z7', 'z7']] },
        { key: 'sevenPairs', ex: [['m1', 'm1'], ['p4', 'p4'], ['s7', 's7'], ['z5', 'z5']], note: '× 7' },
      ] },
      { title: 'Les plus courantes', rows: [
        { key: 'allPungs', ex: [['p2', 'p2', 'p2'], ['s5', 's5', 's5'], ['z6', 'z6', 'z6']] },
        { key: 'halfFlush', ex: [['m2', 'm3', 'm4'], ['z1', 'z1', 'z1']], note: 'une famille + honneurs' },
      ] },
    ],
    bonus: [{ key: 'dragonPung' }, { key: 'seatWind' }, { key: 'roundWind' }, { key: 'allChows' }, { key: 'concealed' }, { key: 'selfDraw' }, { key: 'noFlowers' }, { key: 'seatFlower' }],
  },
};

function fanInfo(mode: Mode, key: string) {
  const f = (mode === 'mcr' ? MCR_FAN_TABLE : FAN_TABLE).find((x) => x.key === key);
  return { name: f?.name ?? key, value: f?.fan ?? 0 };
}
const unit = (mode: Mode, v: number | string) => (typeof v === 'string' ? v : mode === 'mcr' ? `${v} pt${v > 1 ? 's' : ''}` : `${v} fan${v > 1 ? 's' : ''}`);

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function saveOpen(v: boolean) {
  try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
}

/** `bottom`: distance from the bottom of the screen, so the panel stays above your hand. */
export function PlayerAid({ v, onRules, bottom }: { v: PlayerView; onRules: () => void; bottom?: number }) {
  const mode = v.settings.mode;
  const [open, setOpen] = useState(readOpen);
  const [tab, setTab] = useState<Tab>('combos');
  const canHint = v.settings.hints;
  const shownTab: Tab = tab === 'hand' && !canHint ? 'combos' : tab;
  const toggle = () => { setOpen(!open); saveOpen(!open); };

  return (
    <>
      {open && (
        <aside className="aid" aria-label="Aide de jeu" style={bottom !== undefined ? { bottom } : undefined}>
          <div className="aid-head">
            <div>
              <div className="aid-kicker">Aide de jeu · {mode === 'mcr' ? 'MCR' : 'Hong Kong'}</div>
              <div className="aid-title">{shownTab === 'hand' ? 'Pour ma main' : shownTab === 'rules' ? 'L’essentiel des règles' : mode === 'mcr' ? '8 points minimum' : `${v.settings.minFan} fan${v.settings.minFan > 1 ? 's' : ''} minimum`}</div>
            </div>
          </div>
          <div className="aid-tabs" role="tablist" aria-label="Rubriques">
            <button role="tab" aria-selected={shownTab === 'combos'} onClick={() => setTab('combos')}>Combinaisons</button>
            {canHint && <button role="tab" aria-selected={shownTab === 'hand'} onClick={() => setTab('hand')}>Pour ma main</button>}
            <button role="tab" aria-selected={shownTab === 'rules'} onClick={() => setTab('rules')}>Règles</button>
          </div>
          <div className="aid-body">
            {shownTab === 'combos' && <Combos mode={mode} onRules={onRules} />}
            {shownTab === 'hand' && <ForMyHand v={v} />}
            {shownTab === 'rules' && <Rules v={v} onRules={onRules} />}
          </div>
        </aside>
      )}
      <button className={`aid-fab ${open ? 'on' : ''}`} aria-expanded={open} aria-label={open ? 'Fermer l’aide de jeu' : 'Ouvrir l’aide de jeu'} onClick={toggle}>
        {open ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="3.5" y="5" width="11" height="15" rx="2" /><path d="M9 4.2 16.9 3a2 2 0 0 1 2.3 1.7l1.6 11.7a2 2 0 0 1-1.7 2.2l-3.6.5" /></svg>
        )}
        <span>{open ? 'Fermer' : 'Aide'}</span>
      </button>
    </>
  );
}

function Mini({ groups }: { groups: TileCode[][] }) {
  return (
    <span className="aid-tiles">
      {groups.map((g, i) => <span key={i} className="g">{g.map((t, j) => <Tile key={j} t={t} w={15} />)}</span>)}
    </span>
  );
}

function Combos({ mode, onRules }: { mode: Mode; onRules: () => void }) {
  const data = COMBOS[mode];
  return (
    <>
      {data.sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          {s.rows.map((r) => {
            const f = fanInfo(mode, r.key);
            const big = mode === 'mcr' ? Number(f.value) >= 8 : Number(f.value) >= 4 || typeof f.value === 'string';
            return (
              <div className="aid-row" key={r.key}>
                <div className="t">
                  <span className="n">{r.label ?? f.name}</span>
                  <span className="ex"><Mini groups={r.ex} />{r.note && <small>{r.note}</small>}</span>
                </div>
                <span className={`badge ${big ? 'big' : ''}`}>{f.value}</span>
              </div>
            );
          })}
        </section>
      ))}
      <h3>Petits bonus</h3>
      <div className="aid-chips">
        {data.bonus.map((b) => {
          const f = fanInfo(mode, b.key);
          return <span key={b.key}>{b.label ?? f.name}<b>{f.value}</b></span>;
        })}
      </div>
      <button className="aid-link" onClick={onRules}>{mode === 'mcr' ? 'Les 81 combinaisons' : 'Toutes les combinaisons'} →</button>
    </>
  );
}

function ForMyHand({ v }: { v: PlayerView }) {
  const mode = v.settings.mode;
  const me = v.me.seat;
  const hand = v.me.drawn ? [...v.me.hand, v.me.drawn] : v.me.hand;
  const melds = v.seats[me].melds;
  const key = hand.join() + '|' + melds.map((m) => m.tiles.join()).join('/');
  const res = useMemo(
    () => suggestTargets(hand, melds, { mode, seatWind: v.seats[me].wind, roundWind: v.roundWind, sevenPairs: v.settings.sevenPairs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, mode],
  );
  if (!hand.length) return <p className="aid-empty">Rien à analyser pour l’instant.</p>;
  return (
    <>
      <h3>Objectifs à portée</h3>
      {res.targets.length === 0 && <p className="aid-empty">Rien de proche pour l’instant : gardez les paires et les tuiles qui se suivent.</p>}
      {res.targets.map((t, i) => <TargetCard key={t.key} t={t} mode={mode} first={i === 0} />)}
      {res.useless.length > 0 && (
        <>
          <h3>Peu utiles pour l’instant</h3>
          <div className="aid-useless">
            <span className="aid-tiles"><span className="g">{res.useless.map((t) => <Tile key={t} t={t} w={20} />)}</span></span>
            <small>Elles n’entrent dans aucun de ces objectifs.</small>
          </div>
        </>
      )}
      <p className="aid-foot">Mis à jour à chaque tuile. Les tuiles qui manquent sont en transparence.</p>
    </>
  );
}

function TargetCard({ t, mode, first }: { t: Target; mode: Mode; first: boolean }) {
  const held = t.groups.flat().filter((x) => x.have).length;
  const pct = Math.round((100 * held) / Math.max(1, held + t.missing));
  const status = t.missing === 0 ? 'complet' : t.missing === 1 ? 'plus qu’une tuile' : `il manque ${t.missing} tuiles`;
  return (
    <div className={`aid-target ${first ? 'first' : ''}`}>
      <div className="top">
        <span className="n">{t.name}</span>
        <span className="badge big">{mode === 'mcr' && !t.enough ? `+${t.value}` : unit(mode, t.value)}</span>
      </div>
      <span className="aid-tiles">
        {t.groups.map((g, i) => (
          <span key={i} className="g">{g.map((x, j) => <Tile key={j} t={x.tile} w={21} className={x.have ? '' : 'ghost'} label={x.have ? undefined : 'tuile manquante'} />)}</span>
        ))}
      </span>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
      <small>{status}{mode === 'mcr' && !t.enough ? ' · à ajouter à un objectif' : ''}</small>
    </div>
  );
}

function Rules({ v, onRules }: { v: PlayerView; onRules: () => void }) {
  const mcr = v.settings.mode === 'mcr';
  return (
    <>
      <ul className="aid-rules">
        {mcr
          ? <li>Il faut <b>8 points</b>, fleurs non comptées, pour déclarer mahjong. Une main sans aucune combinaison vaut 8.</li>
          : <li>Il faut <b>{v.settings.minFan} fan{v.settings.minFan > 1 ? 's' : ''}</b> au moins pour déclarer mahjong.</li>}
        <li><b>Chow</b> : seulement sur la tuile du joueur à votre gauche. <b>Pung</b> et <b>kong</b> : sur celle de n’importe qui.</li>
        <li><b>Mahjong</b> passe avant tout ; à égalité, le plus proche dans l’ordre de jeu l’emporte.</li>
        {mcr
          ? <li>Chacun paie <b>8</b> au gagnant ; celui qui a jeté paie en plus la valeur de la main (les trois autres en auto-pioche).</li>
          : <li>Celui qui a jeté la tuile paie le double ; en auto-pioche, les trois autres paient.</li>}
        {mcr
          ? <li>Une combinaison déjà incluse dans une plus grande ne compte pas. Le donneur change à chaque main.</li>
          : <li>Le donneur garde la main s’il gagne ou si le mur est épuisé.</li>}
      </ul>
      <button className="aid-link" onClick={onRules}>Toutes les règles →</button>
    </>
  );
}
