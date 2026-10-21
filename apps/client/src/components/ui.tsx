import type { CSSProperties, ReactNode } from 'react';
import type { SeatView } from '@mahjong/engine';

export const WIND_ZH = ['', '東', '南', '西', '北'];
export const WIND_FR = ['', 'Est', 'Sud', 'Ouest', 'Nord'];
export const roundLabel = (w: number) => ['', 'Tour d’Est', 'Tour du Sud', 'Tour d’Ouest', 'Tour du Nord'][w];

const COLORS = ['#e07a3a', '#d8402f', '#3b7ddd', '#8b5cf6', '#22a06b', '#d4a017', '#2bb3c0', '#d0568c'];
export function colorFor(name: string) {
  let h = 2166136261;
  for (const c of name.replace(/\s*\(bot\)$/, '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return COLORS[(h >>> 3) % COLORS.length];
}

interface AvatarProps { name?: string; isBot?: boolean; size?: number; children?: ReactNode; style?: CSSProperties }

export function Avatar({ name, isBot, size, children, style }: AvatarProps) {
  const st = { ...(size ? { ['--av' as string]: `${size}px` } : {}), ...style } as CSSProperties;
  if (!name) return <div className="avatar empty" style={st}>+</div>;
  const initial = name.replace(/\s*\(bot\)$/, '').trim().charAt(0).toUpperCase();
  return (
    <div className="avatar" style={{ ...st, ['--av-bg' as string]: colorFor(name) }}>
      {initial}
      {isBot && <span className="bot">bot</span>}
      {children}
    </div>
  );
}

interface PlateProps {
  seat: number;
  s: SeatView;
  me?: boolean;
  dealer: boolean;
  active: boolean;
  size?: number;
  column?: boolean;
  extra?: ReactNode;
}

/** Player plate: avatar, wind (red for the dealer), name, score, and a timer ring on their turn. */
export function Plate({ seat, s, me, dealer, active, size = 40, column, extra }: PlateProps) {
  const offline = !s.connected && !s.isBot;
  return (
    <div className={`plate ${column ? 'col' : ''} ${active ? 'active' : ''} ${offline ? 'off' : ''}`} data-seat={seat}>
      <Avatar name={s.name} isBot={s.isBot} size={size}>
        <span className={`wind ${dealer ? 'dealer' : ''}`} title={`${WIND_FR[s.wind]}${dealer ? ', donneur' : ''}`}>{WIND_ZH[s.wind]}</span>
        {active && <span className="ring" data-ring />}
      </Avatar>
      <div className="who">
        <span className="nm">{me ? 'Vous' : s.name}</span>
        <span className="sc">{offline ? <span className="chip warn">hors ligne</span> : <>{s.score} pts</>}{extra}</span>
      </div>
    </div>
  );
}

export const Icon = {
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  smile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" /><circle cx="9" cy="10" r=".8" fill="currentColor" /><circle cx="15" cy="10" r=".8" fill="currentColor" /></svg>,
  sound: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>,
  mute: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M17 9l4 6M21 9l-4 6" /></svg>,
};
