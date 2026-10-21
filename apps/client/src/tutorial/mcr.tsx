/**
 * MCR tutorial. The basics (tiles, sets, turns, claims) are shared with Hong Kong;
 * the steps after them cover what makes MCR different: the 8-point minimum, the fans, special hands,
 * the non-repeat principle and payments. Point values come from the engine (MCR_FAN_TABLE).
 */
import { MCR_FAN_TABLE, type Tile as TileCode } from '@mahjong/engine';
import { TileGroup } from '../components/Tile.tsx';
import { HK_STEPS } from './hk.tsx';
import type { Step } from './types.ts';

const pts = (key: string) => MCR_FAN_TABLE.find((f) => f.key === key)?.fan ?? 0;
const name = (key: string) => MCR_FAN_TABLE.find((f) => f.key === key)?.name ?? key;
const label = (key: string) => `${name(key)} (${pts(key)} pts)`;
const row = (codes: TileCode[], w = 28) => <TileGroup tiles={codes} w={w} />;

function Hand({ groups, w = 24 }: { groups: TileCode[][]; w?: number }) {
  return <div className="tuto-hand">{groups.map((g, i) => <TileGroup key={i} tiles={g} w={w} />)}</div>;
}
function Labeled({ label: l, children }: { label: string; children: React.ReactNode }) {
  return <div className="tuto-lab"><small>{l}</small>{children}</div>;
}

const [tiles, , goal, turn, claims] = HK_STEPS;
const app = HK_STEPS[HK_STEPS.length - 1];

export const MCR_STEPS: Step[] = [
  tiles,
  {
    title: 'Les honneurs et les fleurs',
    body: (
      <>
        <p>Les <b>honneurs</b> n’ont pas de numéro : 4 vents et 3 dragons. Ils ne forment jamais de suite.</p>
        <p>Les <b>fleurs</b> sont posées dès qu’on les pioche et remplacées. En MCR, chaque fleur rapporte <b>1 point</b>,
          mais elles ne comptent jamais pour atteindre le minimum.</p>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label="Vents">{row(['z1', 'z2', 'z3', 'z4'])}</Labeled>
        <Labeled label="Dragons">{row(['z5', 'z6', 'z7'])}</Labeled>
        <Labeled label="Fleurs et saisons">{row(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'], 24)}</Labeled>
      </div>
    ),
  },
  goal,
  turn,
  claims,
  {
    title: '8 points minimum',
    body: (
      <>
        <p>C’est la grande différence avec les autres règles : une main ne peut gagner que si ses combinaisons valent
          <b> au moins 8 points</b>, fleurs non comptées.</p>
        <p>Il faut donc construire sa main autour d’un objectif dès le départ, au lieu de compléter n’importe quelles combinaisons.
          Une main complète qui ne vaut que 6 points ne peut pas être déclarée.</p>
      </>
    ),
    quiz: {
      q: 'Votre main complète vaut 6 points, et vous avez 2 fleurs. Pouvez-vous déclarer mahjong ?',
      choices: [
        { label: 'Oui, 6 + 2 = 8', ok: false, why: 'Les fleurs s’ajoutent au total, mais ne comptent pas pour atteindre les 8 points.' },
        { label: 'Non', ok: true, why: 'Exact : il faut 8 points sans les fleurs. Il faut changer de tuile, ou viser une combinaison de plus.' },
      ],
    },
  },
  {
    title: 'Des objectifs qui valent 8 points',
    body: (
      <>
        <p>Ces combinaisons valent <b>8 points ou plus</b> à elles seules :</p>
        <table className="tuto-fans"><tbody>
          {['mixedStraight', 'mixedTripleChow', 'pureStraight', 'sevenPairs', 'fullFlush'].map((k) => (
            <tr key={k}><td>{name(k)}</td><td>{pts(k)} pts</td></tr>
          ))}
        </tbody></table>
        <p>Celles-ci valent 6 points : il faut leur ajouter une petite combinaison (main fermée, pung de dragons, toutes suites…).</p>
        <table className="tuto-fans"><tbody>
          {['halfFlush', 'allPungs', 'allTypes'].map((k) => (
            <tr key={k}><td>{name(k)}</td><td>{pts(k)} pts</td></tr>
          ))}
        </tbody></table>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label={label('mixedStraight')}><Hand groups={[['m1', 'm2', 'm3'], ['p4', 'p5', 'p6'], ['s7', 's8', 's9']]} /></Labeled>
        <Labeled label={label('mixedTripleChow')}><Hand groups={[['m3', 'm4', 'm5'], ['p3', 'p4', 'p5'], ['s3', 's4', 's5']]} /></Labeled>
      </div>
    ),
    quiz: {
      q: 'Laquelle de ces mains contient un dragon mêlé ?',
      choices: [
        { label: <Hand groups={[['m1', 'm2', 'm3'], ['p4', 'p5', 'p6'], ['s7', 's8', 's9']]} w={20} />, ok: true, why: `Oui : 1-2-3, 4-5-6 et 7-8-9 dans trois familles différentes, c’est le dragon mêlé (${pts('mixedStraight')} points).` },
        { label: <Hand groups={[['m1', 'm2', 'm3'], ['m4', 'm5', 'm6'], ['s7', 's8', 's9']]} w={20} />, ok: false, why: 'Deux de ces suites sont dans la même famille : il faut les trois familles.' },
        { label: <Hand groups={[['m2', 'm3', 'm4'], ['p4', 'p5', 'p6'], ['s7', 's8', 's9']]} w={20} />, ok: false, why: 'La première suite doit être 1-2-3 : 2-3-4 ne convient pas.' },
      ],
    },
  },
  {
    title: 'Les mains spéciales',
    body: (
      <>
        <p>Certaines mains ne suivent pas la forme « 4 combinaisons et 1 paire » :</p>
        <ul>
          <li><b>{name('sevenPairs')}</b> : {pts('sevenPairs')} points.</li>
          <li><b>{name('thirteenOrphans')}</b> : les 1, les 9 et tous les honneurs, plus un double. {pts('thirteenOrphans')} points.</li>
          <li><b>Tuiles tissées</b> : 1-4-7, 2-5-8 et 3-6-9, chacun dans une famille différente. Le {name('knittedStraight').toLowerCase()} ({pts('knittedStraight')} pts) se complète
            d’une combinaison et d’une paire ; avec des honneurs isolés, c’est « {name('lesserHonorsKnitted').toLowerCase()} » ({pts('lesserHonorsKnitted')} pts).</li>
        </ul>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label={label('knittedStraight')}><Hand groups={[['m1', 'm4', 'm7'], ['p2', 'p5', 'p8'], ['s3', 's6', 's9'], ['z1', 'z1', 'z1'], ['z5', 'z5']]} /></Labeled>
        <Labeled label={label('lesserHonorsKnitted')}><Hand groups={[['m1', 'm4', 'm7'], ['p2', 'p5'], ['s3', 's6', 's9'], ['z1', 'z2', 'z3', 'z5', 'z6', 'z7']]} /></Labeled>
      </div>
    ),
  },
  {
    title: 'Ce qui ne se cumule pas',
    body: (
      <>
        <p>On compte toutes les combinaisons de la main, avec deux exceptions :</p>
        <ul>
          <li>Une combinaison <b>déjà incluse</b> dans une plus grande ne compte pas. Une couleur pure, par exemple, est forcément « sans honneur » :
            on ne compte que la couleur pure.</li>
          <li>Pour les combinaisons faites de plusieurs suites (ou pungs), chaque nouvelle combinaison doit utiliser au moins une suite <b>pas encore comptée</b>.</li>
        </ul>
        <p>L’application fait le calcul pour vous et garde la lecture de la main qui rapporte le plus.</p>
      </>
    ),
    quiz: {
      q: 'Votre main est une couleur pure en bambous. Compte-t-elle aussi « sans honneur » ?',
      choices: [
        { label: 'Oui', ok: false, why: 'Une couleur pure n’a jamais d’honneur : « sans honneur » est déjà inclus, il ne compte pas en plus.' },
        { label: 'Non', ok: true, why: `Exact : on compte seulement la couleur pure (${pts('fullFlush')} points).` },
      ],
    },
  },
  {
    title: 'Les paiements',
    body: (
      <>
        <ul>
          <li>Chaque joueur paie <b>8 points</b> au gagnant.</li>
          <li>Celui qui a jeté la tuile gagnante paie <b>en plus la valeur de la main</b>.</li>
          <li>En auto-pioche, les trois autres paient chacun 8 plus la valeur de la main.</li>
        </ul>
        <p>Le donneur change à chaque main : un tour, ce sont 4 mains.</p>
      </>
    ),
    quiz: {
      q: 'Vous gagnez une main de 10 points sur la défausse de Lin. Combien recevez-vous en tout ?',
      choices: [
        { label: '10', ok: false, why: 'Tout le monde paie au moins 8 : Lin paie 8 + 10 = 18, et les deux autres 8 chacun.' },
        { label: '30', ok: false, why: 'Presque : chaque joueur paie 8, soit 24, et Lin paie en plus les 10 points de la main.' },
        { label: '34', ok: true, why: 'Oui : Lin paie 8 + 10 = 18, les deux autres paient 8 chacun. 18 + 8 + 8 = 34.' },
      ],
    },
  },
  app,
];
