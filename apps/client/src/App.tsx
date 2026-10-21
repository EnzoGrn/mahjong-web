import { useEffect, useState } from 'react';
import { TILE_SPRITE } from './components/tileArt.ts';
import { Home } from './screens/Home.tsx';
import { Tutorial } from './screens/Tutorial.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { GameOverSheet, MenuSheet, ResultSheet, RulesSheet } from './screens/Sheets.tsx';
import { Table } from './table/Table.tsx';
import { onView, useApp } from './lib/store.ts';

function usePortraitPhone() {
  const check = () => window.innerHeight > window.innerWidth && window.innerWidth < 760;
  const [p, setP] = useState(check);
  useEffect(() => { const on = () => setP(check()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return p;
}

export function App() {
  const app = useApp();
  const [modal, setModal] = useState<'rules' | 'menu' | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [hiddenResult, setHiddenResult] = useState(-1);
  const [resultAt, setResultAt] = useState(0);
  const [, tick] = useState(0);
  const [portraitOk, setPortraitOk] = useState(false);
  const portrait = usePortraitPhone();

  useEffect(() => {
    const open = () => setModal('menu');
    const rules = () => setModal('rules');
    window.addEventListener('mj:menu', open);
    window.addEventListener('mj:rules', rules);
    return () => { window.removeEventListener('mj:menu', open); window.removeEventListener('mj:rules', rules); };
  }, []);
  // Results show up after the "Mahjong!" announcement.
  useEffect(() => onView((prev, next) => {
    if (next.phase === 'end' && prev?.phase !== 'end') {
      const delay = prev ? 1500 : 0;
      setResultAt(Date.now() + delay);
      setTimeout(() => tick((x) => x + 1), delay + 30);
    }
  }), []);

  const v = app.view;
  const room = app.room;
  // The pause menu only makes sense at the table: close it as soon as we leave.
  useEffect(() => { if (!v) setModal((m) => (m === 'menu' ? null : m)); }, [v]);
  useEffect(() => {
    const open = () => { setModal(null); setTutorial(true); };
    window.addEventListener('mj:tutorial', open);
    return () => window.removeEventListener('mj:tutorial', open);
  }, []);
  let screen;
  if (tutorial && !v) screen = <Tutorial onClose={() => setTutorial(false)} />;
  else if (!room) screen = <Home onRules={() => setModal('rules')} onTutorial={() => setTutorial(true)} />;
  else if (!v) screen = <Lobby room={room} />;
  else screen = <Table view={v} />;

  const showResult = v && v.phase === 'end' && v.result && Date.now() >= resultAt && hiddenResult !== v.handNo;

  return (
    <div className="app">
      <div dangerouslySetInnerHTML={{ __html: TILE_SPRITE }} />
      {screen}
      {v && v.phase === 'end' && hiddenResult === v.handNo && (
        <button className="act" style={{ position: 'fixed', left: '50%', bottom: '40%', transform: 'translateX(-50%)', zIndex: 55 }}
          onClick={() => setHiddenResult(-1)}>Voir les résultats</button>
      )}
      {showResult && <ResultSheet v={v} onHide={() => setHiddenResult(v.handNo)} />}
      {v && v.phase === 'over' && room && <GameOverSheet v={v} room={room} />}
      {modal === 'menu' && <MenuSheet onClose={() => setModal(null)} onRules={() => setModal('rules')} />}
      {modal === 'rules' && <RulesSheet onClose={() => setModal(null)} mode={v?.settings.mode ?? room?.settings.mode} />}
      {v && portrait && !portraitOk && (
        <div className="rotate">
          <div>
            <div className="phone" />
            <h2>Tournez votre téléphone</h2>
            <p>La table se joue en paysage.</p>
            <button className="btn small" onClick={() => setPortraitOk(true)}>Continuer quand même</button>
          </div>
        </div>
      )}
      {app.everConnected && !app.connected && <div className="offline-bar">Connexion perdue, reconnexion…</div>}
      {app.toast && <div key={app.toast.id} className="toast" role="status">{app.toast.msg}</div>}
    </div>
  );
}
