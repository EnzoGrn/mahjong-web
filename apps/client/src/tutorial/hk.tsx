/**
 * Hong Kong rules tutorial, step by step.
 * Fan values come from the engine (FAN_TABLE), so they stay right if the table changes.
 */
import { FAN_TABLE, type Tile as TileCode } from '@mahjong/engine';
import { Tile, TileGroup } from '../components/Tile.tsx';
import type { Choice, Step } from './types.ts';

const fan = (key: string) => FAN_TABLE.find((f) => f.key === key)?.fan ?? '?';
const fans = (key: string) => { const f = fan(key); return typeof f === 'number' ? `${f} fan${f > 1 ? 's' : ''}` : 'limite'; };
const name = (key: string) => FAN_TABLE.find((f) => f.key === key)?.name ?? key;

const W = 30;
const row = (codes: TileCode[], w = W) => <TileGroup tiles={codes} w={w} />;
const suit = (s: 'm' | 'p' | 's') => Array.from({ length: 9 }, (_, i) => `${s}${i + 1}` as TileCode);

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="tuto-lab"><small>{label}</small>{children}</div>;
}

/** Example hand, one set per group. */
function Hand({ groups, w = 28 }: { groups: TileCode[][]; w?: number }) {
  return <div className="tuto-hand">{groups.map((g, i) => <TileGroup key={i} tiles={g} w={w} />)}</div>;
}

const tileChoice = (t: TileCode, ok: boolean, why: string): Choice => ({ label: <Tile t={t} w={36} />, ok, why });

export const HK_STEPS: Step[] = [
  {
    title: 'Les tuiles',
    body: (
      <>
        <p>Le jeu compte 144 tuiles. La plupart appartiennent à <b>trois familles</b>, numérotées de 1 à 9 :
          les caractères, les cercles et les bambous.</p>
        <p>Chaque tuile existe en <b>4 exemplaires</b>. Le petit chiffre en haut à gauche aide à les lire.</p>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label="Caractères">{row(suit('m'), 26)}</Labeled>
        <Labeled label="Cercles">{row(suit('p'), 26)}</Labeled>
        <Labeled label="Bambous">{row(suit('s'), 26)}</Labeled>
      </div>
    ),
  },
  {
    title: 'Les honneurs et les fleurs',
    body: (
      <>
        <p>Les <b>honneurs</b> n’ont pas de numéro : 4 vents (Est, Sud, Ouest, Nord) et 3 dragons (rouge, vert, blanc).
          Ils ne forment jamais de suite.</p>
        <p>Les <b>fleurs et saisons</b> ne servent pas à faire une main. Quand vous en piochez une, elle est posée à côté
          de vous et remplacée automatiquement. Celle qui porte le numéro de votre place rapporte {fans('seatFlower')}.</p>
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
  {
    title: 'Le but : 4 combinaisons et 1 paire',
    body: (
      <>
        <p>Vous avez 13 tuiles en main. Pour gagner, il faut en réunir 14 qui forment
          <b> 4 combinaisons et 1 paire</b>. On crie alors « Mahjong ! ».</p>
        <ul>
          <li><b>Chow</b> : une suite de 3 dans la même famille.</li>
          <li><b>Pung</b> : 3 tuiles identiques.</li>
          <li><b>Kong</b> : 4 tuiles identiques (on pioche une tuile de plus).</li>
        </ul>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label="Chow">{row(['m3', 'm4', 'm5'])}</Labeled>
        <Labeled label="Pung">{row(['z5', 'z5', 'z5'])}</Labeled>
        <Labeled label="Kong">{row(['p8', 'p8', 'p8', 'p8'])}</Labeled>
        <Labeled label="Une main gagnante"><Hand groups={[['m1', 'm2', 'm3'], ['p5', 'p5', 'p5'], ['s7', 's8', 's9'], ['z6', 'z6', 'z6'], ['p2', 'p2']]} w={24} /></Labeled>
      </div>
    ),
    quiz: {
      q: 'Lequel de ces groupes est un chow ?',
      choices: [
        { label: row(['z1', 'z2', 'z3'], 26), ok: false, why: 'Les vents sont des honneurs : ils ne forment pas de suite, seulement des pungs.' },
        { label: row(['s4', 's5', 's6'], 26), ok: true, why: 'Oui : 4, 5, 6 dans la même famille, c’est une suite.' },
        { label: row(['p7', 'p8', 's9'], 26), ok: false, why: 'Le 9 est un bambou et les autres des cercles : une suite reste dans une seule famille.' },
        { label: row(['m8', 'm9', 'm1'], 26), ok: false, why: 'Les suites ne bouclent pas : après 9, on ne revient pas à 1.' },
      ],
    },
  },
  {
    title: 'Un tour de jeu',
    body: (
      <>
        <p>À votre tour, vous <b>piochez</b> une tuile, puis vous en <b>jetez</b> une au centre. Vous avez de nouveau 13 tuiles.
          C’est ensuite au joueur à votre droite.</p>
        <p>Gardez les tuiles qui avancent vers des combinaisons, et jetez celles qui ne servent à rien.</p>
      </>
    ),
    quiz: {
      hand: true,
      q: 'Vous venez de piocher. Quelle tuile jetez-vous ?',
      choices: [
        tileChoice('m2', false, 'Elle fait partie de la suite 2-3-4 caractères, déjà complète.'),
        tileChoice('m3', false, 'Elle fait partie de la suite 2-3-4 caractères, déjà complète.'),
        tileChoice('m4', false, 'Elle fait partie de la suite 2-3-4 caractères, déjà complète.'),
        tileChoice('m7', false, 'Avec le 8, elle attend un 6 ou un 9 caractères : elle peut servir.'),
        tileChoice('m8', false, 'Avec le 7, elle attend un 6 ou un 9 caractères : elle peut servir.'),
        tileChoice('p5', false, 'Elle fait partie de la suite 5-6-7 cercles, déjà complète.'),
        tileChoice('p6', false, 'Elle fait partie de la suite 5-6-7 cercles, déjà complète.'),
        tileChoice('p7', false, 'Elle fait partie de la suite 5-6-7 cercles, déjà complète.'),
        tileChoice('p9', true, 'Bon choix aussi : ce 9 est isolé. Mais un 8 cercles pourrait encore l’aider ; l’Est seul, lui, ne peut faire qu’un pung.'),
        tileChoice('s3', false, 'Avec le 4, elle attend un 2 ou un 5 bambous : elle peut servir.'),
        tileChoice('s4', false, 'Avec le 3, elle attend un 2 ou un 5 bambous : elle peut servir.'),
        tileChoice('s8', false, 'La paire de 8 bambous peut devenir votre paire, ou un pung.'),
        tileChoice('s8', false, 'La paire de 8 bambous peut devenir votre paire, ou un pung.'),
        tileChoice('z1', true, 'Parfait : ce vent est seul, et un honneur ne fait jamais de suite. C’est la tuile la moins utile.'),
      ],
    },
  },
  {
    title: 'Prendre une tuile jetée',
    body: (
      <>
        <p>Quand quelqu’un jette une tuile, vous pouvez parfois la prendre pour compléter une combinaison.
          La combinaison est alors posée devant vous, face visible, et vous jetez une tuile.</p>
        <ul>
          <li><b>Chow</b> : uniquement sur la tuile du joueur à votre <b>gauche</b> (celui qui joue juste avant vous).</li>
          <li><b>Pung</b> et <b>Kong</b> : sur la tuile de n’importe qui. Ils passent avant le chow.</li>
          <li><b>Mahjong</b> : sur la tuile de n’importe qui, si elle termine votre main. Il passe avant tout.</li>
        </ul>
      </>
    ),
    demo: (
      <div className="tuto-stack">
        <Labeled label="Votre gauche jette un 6 : chow possible">
          <div className="tuto-take">{row(['p4', 'p5'])}<span>+</span><Tile t="p6" w={W} className="taken" /></div>
        </Labeled>
        <Labeled label="N’importe qui jette un dragon : pung possible">
          <div className="tuto-take">{row(['z5', 'z5'])}<span>+</span><Tile t="z5" w={W} className="taken" /></div>
        </Labeled>
      </div>
    ),
    quiz: {
      q: 'Le joueur en face de vous jette un 6 cercles. Vous avez 4 et 5 cercles. Pouvez-vous faire chow ?',
      choices: [
        { label: 'Oui', ok: false, why: 'Non : le chow ne se fait que sur la tuile du joueur à votre gauche. Celui d’en face ne compte pas.' },
        { label: 'Non', ok: true, why: 'Exact : seul le joueur à votre gauche vous permet de faire chow. Pour un pung, en revanche, peu importe qui jette.' },
      ],
    },
  },
  {
    title: 'Les fans : ce que vaut une main',
    body: (
      <>
        <p>Une main gagnante rapporte des <b>fans</b> selon ce qu’elle contient. Il faut atteindre le minimum choisi par l’hôte
          (souvent 3) pour avoir le droit de déclarer mahjong.</p>
        <p>Quelques fans courants :</p>
        <table className="tuto-fans"><tbody>
          {['selfDraw', 'concealed', 'dragonPung', 'seatWind', 'allChows', 'allPungs', 'halfFlush', 'fullFlush'].map((k) => (
            <tr key={k}><td>{name(k)}</td><td>{fans(k)}</td></tr>
          ))}
        </tbody></table>
      </>
    ),
    quiz: {
      q: 'Cette main est faite de bambous et d’un pung de dragons. Quel fan rapporte-t-elle surtout ?',
      choices: [
        { label: `${name('fullFlush')} (${fans('fullFlush')})`, ok: false, why: 'Il faudrait une seule famille sans aucun honneur. Ici, les dragons sont des honneurs.' },
        { label: `${name('halfFlush')} (${fans('halfFlush')})`, ok: true, why: 'Oui : une seule famille plus des honneurs, c’est la couleur mêlée. Le pung de dragons ajoute encore 1 fan.' },
        { label: `${name('allChows')} (${fans('allChows')})`, ok: false, why: 'Il y a un pung de dragons : la main n’est pas faite que de suites.' },
      ],
    },
    demo: <Hand groups={[['s1', 's2', 's3'], ['s4', 's5', 's6'], ['s7', 's8', 's9'], ['z5', 'z5', 'z5'], ['s2', 's2']]} w={24} />,
  },
  {
    title: 'Les points',
    body: (
      <>
        <p>Les fans se transforment en points. Plus il y a de fans, plus le gain grimpe vite.</p>
        <ul>
          <li>Si vous gagnez sur la <b>tuile jetée</b> par quelqu’un, c’est lui qui paie le plus.</li>
          <li>Si vous gagnez en <b>piochant vous-même</b> la dernière tuile, les trois autres paient.</li>
          <li>Si le mur est épuisé sans gagnant, la main est nulle.</li>
        </ul>
        <p>Le donneur change quand il perd la main. Une partie dure un ou plusieurs tours, selon les réglages.</p>
      </>
    ),
  },
  {
    title: 'Jouer dans l’application',
    body: (
      <>
        <ul>
          <li><b>Touchez</b> une tuile de votre main pour la lever, <b>touchez-la encore</b> pour la jeter.</li>
          <li>Quand vous pouvez prendre une tuile, les boutons <b>Pung</b>, <b>Chow</b>, <b>Kong</b> ou <b>Mahjong</b> apparaissent
            au-dessus de votre main, avec <b>Passer</b>. Une barre montre le temps restant.</li>
          <li>Avec l’aide activée, un <b>point vert</b> marque les tuiles qui, jetées, vous mettent en attente.</li>
          <li>Au centre, le compteur indique les tuiles restantes dans le mur. Le vent allumé montre qui doit jouer.</li>
        </ul>
        <p>Vous êtes prêt. Le mieux pour apprendre : une partie d’essai contre trois bots.</p>
      </>
    ),
  },
];

