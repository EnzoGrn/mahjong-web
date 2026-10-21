import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { tileName, type Tile as TileCode } from '@mahjong/engine';

interface Props {
  t: TileCode | 'back';
  /** Width in pixels; the height follows (4:3 ratio). */
  w?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLSpanElement>) => void;
  selected?: boolean;
  dim?: boolean;
  label?: string;
}

/** A tile: SVG face, coloured edge underneath like a real tile. */
export const Tile = memo(function Tile({ t, w, className = '', style, onClick, selected, dim, label }: Props) {
  const st = { ...(w ? { ['--tw' as string]: `${w}px` } : {}), ...style } as CSSProperties;
  const cls = `tile ${t === 'back' ? 'back' : ''} ${selected ? 'sel' : ''} ${dim ? 'dim' : ''} ${onClick ? 'tap' : ''} ${className}`;
  const onKey = onClick ? (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as MouseEvent<HTMLSpanElement>); }
  } : undefined;
  if (t === 'back') return <span className={cls} style={st} aria-label="tuile cachée" />;
  return (
    <span className={cls} style={st} onClick={onClick} onKeyDown={onKey}
      role={onClick ? 'button' : 'img'} tabIndex={onClick ? 0 : undefined} aria-label={label ?? tileName(t)} aria-pressed={onClick ? !!selected : undefined}>
      <svg viewBox="0 0 60 80" aria-hidden="true"><use href={`#t-${t}`} /></svg>
    </span>
  );
});

/** A row of touching tiles (meld, flowers…). */
export function TileGroup({ tiles, w, highlight }: { tiles: (TileCode | 'back')[]; w: number; highlight?: TileCode }) {
  let used = false;
  return (
    <span className="group">
      {tiles.map((t, i) => {
        const hl = !used && highlight && t === highlight && (used = true);
        return <Tile key={i} t={t} w={w} className={hl ? 'taken' : ''} />;
      })}
    </span>
  );
}
