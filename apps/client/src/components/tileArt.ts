/**
 * Artwork for the 42 tiles, as SVG (60 × 80). Strokes are thick and characters large
 * so tiles stay readable at 20 px wide.
 */
const INK = '#1c2340', RED = '#c8302a', GREEN = '#167349', BLUE = '#1f56a6';
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CJK = "font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900";

const text = (x: number, y: number, size: number, fill: string, ch: string) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" style="${CJK}">${ch}</text>`;
const index = (label: string | number, fill = '#6b5f48') =>
  `<text x="6" y="14" font-size="13" fill="${fill}" font-family="'Baloo 2',system-ui,sans-serif" font-weight="800">${label}</text>`;

function dot(x: number, y: number, r: number, c: string) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.66}" fill="#fffdf6"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${c}"/>`;
}
const DOTS: Record<number, [number, number, number, string][]> = {
  1: [[30, 42, 19, BLUE]],
  2: [[30, 23, 11, GREEN], [30, 59, 11, BLUE]],
  3: [[15, 18, 9.5, BLUE], [30, 41, 9.5, RED], [45, 64, 9.5, GREEN]],
  4: [[18, 25, 10, BLUE], [42, 25, 10, GREEN], [18, 58, 10, GREEN], [42, 58, 10, BLUE]],
  5: [[16, 20, 9, BLUE], [44, 20, 9, GREEN], [30, 41, 9, RED], [16, 62, 9, GREEN], [44, 62, 9, BLUE]],
  6: [[19, 17, 8.6, GREEN], [41, 17, 8.6, GREEN], [19, 43, 8.6, RED], [41, 43, 8.6, RED], [19, 65, 8.6, RED], [41, 65, 8.6, RED]],
  7: [[13, 13, 7, GREEN], [30, 22, 7, GREEN], [47, 31, 7, GREEN], [19, 51, 7.6, RED], [41, 51, 7.6, RED], [19, 68, 7.6, RED], [41, 68, 7.6, RED]],
  8: [12, 31, 50, 69].flatMap((y) => [[19, y, 8, BLUE], [41, y, 8, BLUE]] as [number, number, number, string][]),
  9: ([[17, BLUE], [41, RED], [65, GREEN]] as [number, string][]).flatMap(([y, c]) =>
    [[14, y, 7.8, c], [30, y, 7.8, c], [46, y, 7.8, c]] as [number, number, number, string][]),
};

function stick(x: number, y: number, h: number, c = GREEN) {
  const w = 8, top = y - h / 2;
  return `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="3.6" fill="${c}"/>` +
    `<rect x="${x - w / 2 - 0.8}" y="${y - 1.4}" width="${w + 1.6}" height="2.8" rx="1.4" fill="${c}"/>` +
    `<rect x="${x - 1.1}" y="${top + 2.5}" width="2.2" height="${h - 5}" rx="1.1" fill="#fff" opacity=".4"/>`;
}
type S = [number, number, number, string?];
const STICKS: Record<number, S[]> = {
  2: [[30, 23, 31], [30, 59, 31]],
  3: [[30, 23, 31], [18, 59, 31], [42, 59, 31]],
  4: [[19, 23, 31], [41, 23, 31], [19, 59, 31], [41, 59, 31]],
  5: [[14, 23, 31], [46, 23, 31], [30, 41, 31, RED], [14, 59, 31], [46, 59, 31]],
  6: [14, 30, 46].flatMap((x) => [[x, 23, 31], [x, 59, 31]] as S[]),
  7: [[30, 15, 21, RED], ...[14, 30, 46].flatMap((x) => [[x, 42, 22], [x, 67, 22]] as S[])],
  8: [11.5, 23.5, 36.5, 48.5].flatMap((x, i) => [[x, 23, 31, i % 3 ? GREEN : BLUE], [x, 59, 31, i % 3 ? GREEN : BLUE]] as S[]),
  9: [14, 30, 46].flatMap((x) => [15, 41, 67].map((y) => [x, y, 22, x === 30 ? RED : GREEN] as S)),
};

const BIRD = `<path d="M13 59 C9 44 18 30 31 30 C43 30 49 41 47 51 C45 62 33 67 24 65 Z" fill="${GREEN}"/>
  <path d="M18 57 C22 49 30 46 39 50" stroke="#fffdf6" stroke-width="2" fill="none" opacity=".75"/>
  <path d="M22 63 C14 71 10 75 6 77 M26 64 C22 72 20 76 18 79 M30 64 C30 72 31 76 32 79" stroke="${BLUE}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="42" cy="24" r="9" fill="${RED}"/><path d="M50 22 L57 25 L50 28 Z" fill="#d89b2a"/>
  <circle cx="44" cy="22" r="2" fill="#fffdf6"/>`;

function blossom(c: string) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    s += `<circle cx="${47 + Math.cos(a) * 4.4}" cy="${14 + Math.sin(a) * 4.4}" r="3.2" fill="${c}" opacity=".85"/>`;
  }
  return s + '<circle cx="47" cy="14" r="2.1" fill="#d89b2a"/>';
}

const WINDS: Record<number, [string, string]> = { 1: ['東', 'E'], 2: ['南', 'S'], 3: ['西', 'O'], 4: ['北', 'N'] };
const FLOWERS: Record<number, [string, string]> = {
  1: ['梅', '#c23a5a'], 2: ['蘭', '#7a3e9d'], 3: ['菊', '#c27a12'], 4: ['竹', GREEN],
  5: ['春', GREEN], 6: ['夏', RED], 7: ['秋', '#c86414'], 8: ['冬', BLUE],
};

function face(k: string): string {
  const s = k[0], n = Number(k.slice(1));
  if (s === 'm') return index(n) + text(30, 39, 30, INK, NUM[n]) + text(30, 74, 31, RED, '萬');
  if (s === 'p') return index(n) + DOTS[n].map(([x, y, r, c]) => dot(x, y, r, c)).join('') + (n === 1 ? `<circle cx="30" cy="42" r="4.5" fill="${RED}"/>` : '');
  if (s === 's') return index(n) + (n === 1 ? BIRD : STICKS[n].map(([x, y, h, c]) => stick(x, y, h, c)).join(''));
  if (s === 'z') {
    if (n <= 4) return index(WINDS[n][1], INK) + text(30, 60, 46, INK, WINDS[n][0]);
    if (n === 5) return text(30, 61, 50, RED, '中');
    if (n === 6) return text(30, 61, 48, GREEN, '發');
    return `<rect x="11" y="13" width="38" height="54" rx="3.5" fill="none" stroke="${BLUE}" stroke-width="4"/>` +
      `<rect x="17.5" y="19.5" width="25" height="41" rx="1.5" fill="none" stroke="${BLUE}" stroke-width="1.8"/>`;
  }
  if (s === 'f') {
    const [ch, c] = FLOWERS[n];
    return index(((n - 1) % 4) + 1, c) + blossom(c) + text(30, 64, 40, c, ch);
  }
  return '';
}

const KINDS = [
  ...['m', 'p', 's'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => s + n)),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => 'z' + n),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'f' + n),
];

/** Sprite to insert once in the page; each tile is a <symbol id="t-xx"> in it. */
export const TILE_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${
  KINDS.map((k) => `<symbol id="t-${k}" viewBox="0 0 60 80">${face(k)}</symbol>`).join('')}</svg>`;
