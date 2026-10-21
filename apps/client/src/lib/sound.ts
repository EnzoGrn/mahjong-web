/** Synthesised sounds (Web Audio): no file to load. */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('mj2.muted') === '1';

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
window.addEventListener('pointerdown', () => ac(), { once: true });

function clack(vol: number) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.06), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300 + Math.random() * 500; bp.Q.value = 1.3;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(bp).connect(g).connect(a.destination); src.start(t);
  const o = a.createOscillator(); o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.05);
  const og = a.createGain(); og.gain.setValueAtTime(vol * 0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(og).connect(a.destination); o.start(t); o.stop(t + 0.08);
}

function tones(freqs: number[], dur = 0.15, type: OscillatorType = 'triangle', vol = 0.16, gap = 0.09) {
  const a = ac(); if (!a || muted) return;
  freqs.forEach((f, i) => {
    const t = a.currentTime + i * gap;
    const o = a.createOscillator(); o.type = type; o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  });
}

export const sound = {
  discard: () => clack(0.55),
  tap: () => clack(0.22),
  yourTurn: () => tones([660, 880], 0.18, 'sine', 0.12, 0.08),
  claim: () => { clack(0.6); tones([392, 523], 0.16, 'square', 0.05, 0.07); },
  win: () => tones([523, 659, 784, 1047, 1319], 0.35, 'triangle', 0.15, 0.09),
  exhaust: () => tones([440, 330], 0.25, 'sine', 0.1, 0.15),
  get muted() { return muted; },
  toggle() { muted = !muted; localStorage.setItem('mj2.muted', muted ? '1' : '0'); return muted; },
};
