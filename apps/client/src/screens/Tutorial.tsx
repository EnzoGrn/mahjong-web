/**
 * Tutorial: a step-by-step course per game mode, with small exercises.
 * It ends with a practice game against three bots.
 */
import { useEffect, useState } from 'react';
import { TUTORIALS } from '../tutorial/index.ts';
import type { Mode } from '@mahjong/engine';
import { startPractice, toast, useApp } from '../lib/store.ts';

const SEEN_KEY = 'mj2.tutorial';

export function Tutorial({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState(TUTORIALS[0].key);
  const tuto = TUTORIALS.find((t) => t.key === mode)!;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const step = tuto.steps[i];
  const last = i === tuto.steps.length - 1;

  const go = (n: number) => { setI(Math.max(0, Math.min(tuto.steps.length - 1, n))); setPicked(null); };
  useEffect(() => { setI(0); setPicked(null); }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (last) try { localStorage.setItem(SEEN_KEY, mode); } catch { /* storage unavailable */ } }, [last, mode]);

  const practice = () => {
    const n = app.name.trim();
    if (!n) { toast('Choisissez d’abord un nom sur l’accueil.'); onClose(); return; }
    onClose();
    startPractice(n, tuto.key as Mode);
  };

  const choice = step?.quiz && picked !== null ? step.quiz.choices[picked] : null;

  return (
    <main className="screen">
      <div className="tuto">
        <header className="lobby-bar">
          <button className="btn small" onClick={onClose}>← Accueil</button>
          <h1>Apprendre à jouer</h1>
        </header>

        <div className="seg tuto-modes" role="tablist" aria-label="Mode de jeu">
          {TUTORIALS.map((t) => (
            <button key={t.key} role="tab" aria-pressed={mode === t.key} aria-selected={mode === t.key} onClick={() => setMode(t.key)}>
              {t.name}{!t.steps.length && <small> bientôt</small>}
            </button>
          ))}
        </div>

        {!step ? (
          <section className="card tuto-card soon">
            <h2>{tuto.name}</h2>
            <p>{tuto.tagline}</p>
            <p className="note">Ce mode arrive bientôt, avec son propre tutoriel pas à pas.</p>
          </section>
        ) : (
          <>
            <div className="tuto-progress" aria-label={`Étape ${i + 1} sur ${tuto.steps.length}`}>
              {tuto.steps.map((s, k) => (
                <button key={k} className={k === i ? 'on' : k < i ? 'done' : ''} onClick={() => go(k)} title={s.title} aria-label={`Étape ${k + 1} : ${s.title}`} />
              ))}
            </div>

            <section key={`${mode}-${i}`} className={`card tuto-card ${step.demo ? 'has-demo' : ''}`}>
              <div className="tuto-text">
                <div className="tuto-num">Étape {i + 1} sur {tuto.steps.length}</div>
                <h2>{step.title}</h2>
                {step.body}
              </div>
              {step.demo && <div className="tuto-demo">{step.demo}</div>}
              {step.quiz && (
                <div className="tuto-quiz">
                  <div className="q">{step.quiz.q}</div>
                  <div className={`choices ${step.quiz.hand ? 'hand' : ''}`}>
                    {step.quiz.choices.map((c, k) => (
                      <button key={k} className={`choice ${picked === k ? (c.ok ? 'ok' : 'ko') : ''} ${picked !== null && c.ok && picked !== k && !choice?.ok ? 'hint' : ''}`}
                        onClick={() => setPicked(k)} aria-pressed={picked === k}>{c.label}</button>
                    ))}
                  </div>
                  <p className={`feedback ${choice ? (choice.ok ? 'ok' : 'ko') : ''}`} aria-live="polite">
                    {choice ? <><b>{choice.ok ? 'Bien vu. ' : 'Pas tout à fait. '}</b>{choice.why}</> : 'Touchez votre réponse.'}
                  </p>
                </div>
              )}
            </section>

            <footer className="tuto-nav">
              <button className="btn" disabled={i === 0} onClick={() => go(i - 1)}>Précédent</button>
              {last ? (
                <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={onClose}>Terminer</button>
                  <button className="btn gold" onClick={practice}>Partie d’essai contre 3 bots</button>
                </div>
              ) : <button className="btn gold" onClick={() => go(i + 1)}>Suivant</button>}
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
