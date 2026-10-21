import { useState } from 'react';
import { Tile } from '../components/Tile.tsx';
import { createTable, joinTable, setName as saveName, toast, urlCode, useApp } from '../lib/store.ts';

export function Home({ onRules, onTutorial }: { onRules: () => void; onTutorial: () => void }) {
  const app = useApp();
  const [name, setName] = useState(app.name);
  const [code, setCode] = useState(urlCode);

  const checkName = () => {
    const n = name.trim();
    if (!n) { toast('Choisissez un nom pour vous asseoir.'); return null; }
    return n;
  };
  const join = () => {
    const c = code.toUpperCase().replace(/[^A-Z]/g, '');
    if (c.length !== 4) { toast('Le code de table fait 4 lettres.'); return; }
    const n = checkName();
    if (n) joinTable(c, n);
  };

  return (
    <main className="screen">
      <div className="home">
        <div className="hero">
          <div className="hero-tiles" aria-hidden="true">
            <Tile t="z1" /><Tile t="z5" /><Tile t="p1" /><Tile t="s1" />
          </div>
          <h1>Mahjong</h1>
          <p>Une table à quatre entre amis, règles de Hong Kong ou de compétition (MCR).</p>
        </div>
        <div className="card">
          <label className="field">
            <span>Votre nom</span>
            <input className="input" value={name} maxLength={16} autoComplete="nickname" placeholder="Ex. Camille"
              onChange={(e) => { setName(e.target.value); saveName(e.target.value); }} />
          </label>
          <button className="btn gold block" onClick={() => { const n = checkName(); if (n) createTable(n); }}>Créer une table</button>
          <div className="or">ou rejoindre la table d’un ami</div>
          <div className="row">
            <input className="input code grow" value={code} maxLength={4} placeholder="CODE" aria-label="Code de la table"
              autoComplete="off" autoCapitalize="characters" onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') join(); }} />
            <button className="btn" onClick={join}>Rejoindre</button>
          </div>
          <div className="home-learn">
            <button className="btn block" onClick={onTutorial}>Apprendre à jouer <small>tutoriel pas à pas</small></button>
            <button className="link" onClick={onRules}>Règles et combinaisons</button>
          </div>
        </div>
      </div>
    </main>
  );
}
