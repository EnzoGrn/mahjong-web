import type { Mode, RoomView, Settings } from '@mahjong/engine';
import { Avatar } from '../components/ui.tsx';
import { leaveTable, send, toast, updateSettings } from '../lib/store.ts';

const OPTIONS: { key: keyof Settings; name: string; desc: string; opts: [Settings[keyof Settings], string][]; modes?: Mode[] }[] = [
  { key: 'minFan', modes: ['hk'], name: 'Fans minimum', desc: 'Valeur qu’une main doit atteindre pour gagner', opts: [[0, '0'], [1, '1'], [3, '3']] },
  { key: 'rounds', name: 'Durée', desc: 'Un tour : chacun est donneur au moins une fois', opts: [[1, '1 tour'], [2, '2 tours'], [4, '4 tours']] },
  { key: 'pace', name: 'Temps pour jouer', desc: 'Avant qu’un bot joue à votre place', opts: [['fast', 'Court'], ['normal', 'Normal'], ['relaxed', 'Long']] },
  { key: 'sevenPairs', modes: ['hk'], name: 'Sept paires', desc: 'Main spéciale à 4 fans', opts: [[true, 'Oui'], [false, 'Non']] },
  { key: 'hints', name: 'Aide au jeu', desc: 'Signale les tuiles qui vous mettent en attente', opts: [[true, 'Oui'], [false, 'Non']] },
];

const MODES: { key: Mode; name: string; desc: string }[] = [
  { key: 'hk', name: 'Hong Kong', desc: 'Rapide et convivial, quelques fans suffisent' },
  { key: 'mcr', name: 'MCR', desc: 'Règles de compétition : 81 combinaisons, 8 points minimum' },
];

export function Lobby({ room }: { room: RoomView }) {
  const filled = room.seats.filter(Boolean).length;
  const empty = room.seats.map((p, s) => (p ? -1 : s)).filter((s) => s >= 0);
  const link = `${location.origin}${location.pathname}?table=${room.code}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Lien copié. Envoyez-le à vos amis.'); }
    catch { prompt('Copiez ce lien :', link); }
  };
  const share = () => navigator.share?.({ title: 'Mahjong entre amis', text: `Rejoins ma table de mahjong (code ${room.code})`, url: link }).catch(() => {});
  const fill = () => empty.forEach((s) => send({ t: 'addBot', seat: s }));
  // You first, then the other seats in order.
  const order = [0, 1, 2, 3].map((i) => (room.seat + i) % 4);

  return (
    <main className="screen">
      <div className="lobby2">
        <header className="lobby-bar">
          <button className="btn small" onClick={() => leaveTable()}>← Quitter</button>
          <h1>Votre table</h1>
        </header>

        <div className="lobby-cols">
          <div className="lobby-col">
            <section className="card code-card">
              <div className="lbl">Code à donner à vos amis</div>
              <div className="big-code" aria-label={`Code ${room.code.split('').join(' ')}`}>{room.code}</div>
              <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn small" onClick={copy}>Copier le lien</button>
                {'share' in navigator && <button className="btn small" onClick={share}>Partager</button>}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Joueurs <span className="count">{filled}/4</span></h2>
                {room.youAreHost && empty.length > 0 && <button className="pill-btn gold" onClick={fill}>Compléter avec des bots</button>}
              </div>
              <ul className="players">
                {order.map((s) => {
                  const p = room.seats[s];
                  const isMe = s === room.seat;
                  const tag = !p ? null : isMe ? 'Vous' : p.isBot ? 'Bot' : !p.connected ? 'Hors ligne' : 'Connecté';
                  return (
                    <li key={s} className={p ? '' : 'free'}>
                      <Avatar name={p?.name} isBot={p?.isBot} size={38} />
                      <div className="who">
                        <span className="nm">{p ? p.name : 'Place libre'}</span>
                        <span className="sub">
                          {tag && <span className={`tag ${p && !p.connected && !p.isBot ? 'off' : ''}`}>{tag}</span>}
                          {p?.isHost && <span className="tag host">Hôte</span>}
                          {!p && 'En attente d’un ami'}
                        </span>
                      </div>
                      {room.youAreHost && !p && <button className="pill-btn" onClick={() => send({ t: 'addBot', seat: s })}>+ Bot</button>}
                      {room.youAreHost && p && !isMe && !p.isHost && <button className="pill-btn" onClick={() => send({ t: 'kick', seat: s })}>Retirer</button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="lobby-col">
            <section className="card settings">
              <div className="setting mode">
                <div><div className="name">Règles</div><div className="desc">{MODES.find((m) => m.key === room.settings.mode)?.desc}</div></div>
                <div className="seg" role="group" aria-label="Règles">
                  {MODES.map((m) => (
                    <button key={m.key} aria-pressed={room.settings.mode === m.key} disabled={!room.youAreHost}
                      onClick={() => updateSettings({ ...room.settings, mode: m.key })}>{m.name}</button>
                  ))}
                </div>
              </div>
              {OPTIONS.filter((o) => !o.modes || o.modes.includes(room.settings.mode)).map((o) => (
                <div className="setting" key={o.key}>
                  <div><div className="name">{o.name}</div><div className="desc">{o.desc}</div></div>
                  <div className="seg" role="group" aria-label={o.name}>
                    {o.opts.map(([v, label]) => (
                      <button key={String(v)} aria-pressed={room.settings[o.key] === v} disabled={!room.youAreHost}
                        onClick={() => updateSettings({ ...room.settings, [o.key]: v })}>{label}</button>
                    ))}
                  </div>
                </div>
              ))}
              {!room.youAreHost && <p className="note" style={{ marginTop: 10 }}>Seul l’hôte peut changer les réglages.</p>}
            </section>

            {room.youAreHost ? (
              <div className="start">
                <button className="btn gold block" disabled={filled < 4} onClick={() => send({ t: 'start' })}>
                  {filled < 4 ? `En attente de ${4 - filled} joueur${4 - filled > 1 ? 's' : ''}` : 'Lancer la partie'}
                </button>
                <p className="note">{filled < 4 ? 'Envoyez le code à vos amis, ou complétez avec des bots.' : 'Les places et les vents seront tirés au sort.'}</p>
              </div>
            ) : <p className="note start">L’hôte lancera la partie quand la table sera complète.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
