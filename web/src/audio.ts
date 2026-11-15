// Small synthesized sounds, so nothing needs to be downloaded. Off until the person clicks something.

let ctx: AudioContext | null = null;
let on = true;
try { on = localStorage.getItem('buildscape-sound') !== 'off'; } catch { /* storage may be blocked */ }

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  if (!on) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* sound is a nice-to-have */ }
}

export const sound = {
  get on() { return on; },
  toggle() {
    on = !on;
    try { localStorage.setItem('buildscape-sound', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (on) tone(660, 0, 0.12);
    return on;
  },
  task() { tone(620, 0, 0.09, 'triangle'); tone(930, 0.07, 0.14, 'triangle'); },
  stage() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.11, 0.22)); },
  ask() { tone(190, 0, 0.09, 'square', 0.06); tone(190, 0.16, 0.09, 'square', 0.06); tone(520, 0.36, 0.25, 'sine', 0.06); },
  problem() { tone(300, 0, 0.16, 'sawtooth', 0.04); tone(220, 0.14, 0.24, 'sawtooth', 0.04); },
  finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3)); },
};
