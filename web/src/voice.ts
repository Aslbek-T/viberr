// The guide's voice, and listening for a short spoken answer.
// Speaking: the brain asks ElevenLabs for a natural voice (the key stays in the brain). If that is not set up,
// or the brain is not running (the demo), the browser's own voice reads the words instead.
// Listening: the browser's own speech recognition when it has one, otherwise a short recording that the
// brain sends to ElevenLabs. Nothing here is required: every question can still be answered with a click.

type Kind = 'elevenlabs' | 'browser';

let on = true;
try { on = localStorage.getItem('vibeerr-voice') !== 'off'; } catch { /* storage may be blocked */ }
let kind: Kind = 'browser';
let brainUp = () => false;
let misses = 0;

let audio: HTMLAudioElement | null = null;
let playing: Promise<void> | null = null;
let stopPlaying: (() => void) | null = null;
let pending: { text: string; done: () => void } | null = null;
/** Explanations wait their turn and are never dropped, unlike ordinary lines. */
const queued: { text: string; done: () => void }[] = [];
let token = 0;

const clean = (text: string) => text.replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

function browserSay(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve(); return; }
    const line = new SpeechSynthesisUtterance(text);
    line.rate = 1.02;
    const english = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
    line.voice = english.find((v) => /natural|samantha|google us|aria|jenny/i.test(v.name)) ?? english[0] ?? null;
    const timer = window.setTimeout(resolve, 2500 + text.length * 90); // some browsers never fire "end"
    line.onend = line.onerror = () => { clearTimeout(timer); resolve(); };
    stopPlaying = () => { synth.cancel(); clearTimeout(timer); resolve(); };
    synth.speak(line);
  });
}

async function naturalSay(text: string, mine: number): Promise<boolean> {
  if (kind !== 'elevenlabs' || !brainUp()) return false;
  let res: Response;
  try {
    res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  } catch { return false; }
  if (res.status !== 200) { if (++misses >= 3) kind = 'browser'; return false; } // keep trying a few times, then stop waiting on it
  misses = 0;
  const url = URL.createObjectURL(await res.blob());
  if (mine !== token) { URL.revokeObjectURL(url); return true; } // something more urgent came first
  return new Promise((resolve) => {
    const el = new Audio(url);
    audio = el;
    const end = () => { URL.revokeObjectURL(url); if (audio === el) audio = null; resolve(true); };
    el.onended = el.onerror = end;
    stopPlaying = () => { el.pause(); end(); };
    el.play().catch(() => end()); // autoplay may be blocked until the person clicks something
  });
}

async function play(text: string) {
  const mine = ++token;
  const spoke = await naturalSay(text, mine);
  if (!spoke && mine === token) await browserSay(text);
}

async function drain(first: string, done: () => void) {
  let text = first;
  let finish = done;
  for (;;) {
    playing = play(text);
    await playing;
    finish();
    const next = queued.shift() ?? pending;
    if (!next) break;
    if (next === pending) pending = null;
    ({ text, done: finish } = next);
  }
  playing = null;
  stopPlaying = null;
}

export const voice = {
  get on() { return on; },
  get natural() { return kind === 'elevenlabs'; },
  /** Called once the brain says whether ElevenLabs is set up. */
  setup(next: Kind, isUp: () => boolean) { kind = next; brainUp = isUp; },
  toggle() {
    on = !on;
    try { localStorage.setItem('vibeerr-voice', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) voice.hush();
    return on;
  },
  /**
   * Reads a line aloud. A normal line waits for the one being read, and only the newest waiting line is kept,
   * so the voice never falls far behind the build. `true` (a question) cuts in at once.
   * 'queue' (an explanation) waits its turn and is never dropped.
   * Resolves when the line has been read, or skipped.
   */
  say(text: string, how: boolean | 'queue' = false): Promise<void> {
    const words = clean(text);
    if (!on || !words) return Promise.resolve();
    return new Promise((resolve) => {
      if (how === true) voice.hush();
      if (playing) {
        if (how === 'queue') { queued.push({ text: words, done: resolve }); return; }
        pending?.done();
        pending = { text: words, done: resolve };
        return;
      }
      void drain(words, resolve);
    });
  },
  /** Stops reading and forgets anything waiting. */
  hush() {
    token++;
    pending?.done();
    pending = null;
    for (const item of queued.splice(0)) item.done();
    stopPlaying?.();
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  },
};

// ---------------------------------------------------------------- listening

const Recognition: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
let stopListening: (() => void) | null = null;

export const ears = {
  /** True when this browser can hear an answer, by itself or through the brain. */
  get ready() { return !!Recognition || (kind === 'elevenlabs' && brainUp() && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'); },
  get busy() { return !!stopListening; },
  /** Ends listening early. What was heard so far is still used. */
  stop() { stopListening?.(); },
  /** Listens for one short answer. Resolves with the words heard, or null. */
  listen(maxMs = 7000): Promise<string | null> {
    voice.hush();
    if (stopListening) stopListening();
    return Recognition ? listenInBrowser(maxMs) : listenThroughBrain(Math.min(maxMs, 6000));
  },
};

function listenInBrowser(maxMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let heard = '';
    let settled = false;
    const rec = new Recognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopListening = null;
      resolve(heard.trim() || null);
    };
    const timer = window.setTimeout(() => { try { rec.stop(); } catch { finish(); } }, maxMs);
    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) heard += ` ${event.results[i][0].transcript}`;
    };
    rec.onerror = finish;
    rec.onend = finish;
    stopListening = () => { try { rec.stop(); } catch { finish(); } };
    try { rec.start(); } catch { finish(); }
  });
}

async function listenThroughBrain(maxMs: number): Promise<string | null> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return null; }
  const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  const timer = window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), maxMs);
  stopListening = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  recorder.start();
  await stopped;
  clearTimeout(timer);
  stopListening = null;
  for (const track of stream.getTracks()) track.stop();
  const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
  try {
    const res = await fetch('/api/listen', { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob });
    const out = await res.json();
    return out.ok && typeof out.text === 'string' ? out.text : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- understanding a spoken answer

const NO = /\b(no|nope|nah|not yet|not now|stop|wait|hold on|don'?t|do not|cancel|skip|deny|later|without)\b/;
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|go for it|go|build|do it|start|allow|approve|sounds good|let'?s go|please|fine|correct|right)\b/;
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Which button a spoken answer means. Every question puts the "go ahead" choice first and the
 * "stop" choice second, so plain yes and no words work everywhere. Null when it is not clear.
 */
export function matchAnswer(heard: string, labels: string[]): number | null {
  const said = norm(heard).replace(/\bno problem\b/g, 'fine');
  if (!said) return null;
  // "No" words win, so "no, don't build this" is never read as "build this".
  if (labels.length >= 2 && NO.test(said)) return 1;
  const byLength = labels.map((label, index) => ({ label: norm(label), index })).sort((a, b) => b.label.length - a.label.length);
  for (const { label, index } of byLength) if (label && said.includes(label)) return index;
  if (YES.test(said)) return 0;
  return null;
}

// ---------------------------------------------------------------- spoken commands

export type Command =
  | { kind: 'agent'; agent: 'claude' | 'cursor' | 'codex' }
  | { kind: 'open-app' } | { kind: 'open-guide' } | { kind: 'stop' } | { kind: 'start-over' }
  | { kind: 'voice'; on: boolean } | { kind: 'sound'; on: boolean }
  | { kind: 'show'; stage: string } | { kind: 'where' } | { kind: 'summary' } | { kind: 'help' } | { kind: 'demo' };

const STAGE_WORDS: [RegExp, string][] = [
  [/\b(idea|plan)\b/, 'plan'], [/\b(start|setup|set up)\b/, 'setup'], [/\b(pages?|screens?|look)\b/, 'look'],
  [/\b(actions?|logic)\b/, 'logic'], [/\b(saved|memory|storage)\b/, 'memory'], [/\b(try ?out|tests?|checks?)\b/, 'check'],
  [/\b(done|finish|finished|ready)\b/, 'done'],
];

/**
 * A short spoken command, or null when the words are a note or a question instead.
 * Commands must start the sentence, so a note like "add a stop button" is never read as "stop".
 */
export function parseCommand(heard: string): Command | null {
  const t = norm(heard).replace(/^(hey |ok |okay |please |can you |could you |vibeerr |viber )+/g, '').replace(/ please$/, '');
  if (!t) return null;
  const agent = t.match(/^(switch|change|use|go|move)( over)?( the (ai|builder|model))?( to| with)? (claude|cursor|codex)\b/);
  if (agent) return { kind: 'agent', agent: agent[6] as 'claude' | 'cursor' | 'codex' };
  if (/^(open|show|launch|run|try)( me)? (my|the|our)? ?(app|project|website|site|page)\b/.test(t)) return { kind: 'open-app' };
  if (/^(open|show)( me)? (the )?(developer|dev|handoff)( guide)?\b/.test(t)) return { kind: 'open-guide' };
  if (/^(stop|pause)( the)?( builder| building| build| it| now)*$/.test(t)) return { kind: 'stop' };
  if (/^(start over|start again|reset|new project)\b/.test(t)) return { kind: 'start-over' };
  const v = t.match(/^(turn )?(voice|talking|speaking)( on| off)\b|^(mute|be quiet|quiet|stop talking|unmute)\b/);
  if (v) return { kind: 'voice', on: v[4] ? v[4] === 'unmute' : v[3] === ' on' };
  const snd = t.match(/^(turn )?(the )?sounds?( on| off)\b/);
  if (snd) return { kind: 'sound', on: snd[3] === ' on' };
  if (/^(what'?s happening|what is happening|where are we|what are you doing|what is it doing|repeat|say that again)\b/.test(t)) return { kind: 'where' };
  if (/^(read|tell me)( me)? (the )?(summary|result)\b/.test(t)) return { kind: 'summary' };
  if (/^(help|what can i say|commands)\b/.test(t)) return { kind: 'help' };
  if (/^(watch|play|show)( me)? (the |a )?demo\b/.test(t)) return { kind: 'demo' };
  const show = t.match(/^(show|open|go to|take me to)( me)?( the)? (.+?)( part| district| step)?$/);
  if (show) for (const [re, stage] of STAGE_WORDS) if (re.test(show[4])) return { kind: 'show', stage };
  return null;
}

export const COMMAND_HELP = 'You can say: switch to Codex, open my app, open the developer guide, show the pages, what is happening, stop, or voice off. Anything else is sent as a note or a question.';
