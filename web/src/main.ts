import { STAGES, stageInfo, type RunState, type StageId, type StoryMsg } from '../../shared/story.ts';
import { sound } from './audio.ts';
import { demo, live, type Feed } from './net.ts';
import { builder, scene, setSteps } from './scenes.ts';
import './styles.css';

// The whole screen is driven by the friendly story messages from the brain (shared/story.ts).
// Nothing technical is ever shown: no code, no file names, no commands.

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced ? Math.min(ms, 120) : ms));
const MIN_STAGE_MS = 5000; // every stage window stays up at least this long, even when the builder is fast

const EXAMPLES = [
  'An app to track how tall my plants grow',
  'A chore chart for my family with points',
  'A tip calculator that splits the bill between friends',
  'A reading list where I can rate the books I finish',
];

let view: RunState | null = null;      // what is on screen (follows the brain a few seconds behind, on purpose)
let shown: StageId = 'plan';           // which stage window is open
let source: 'live' | 'demo' = 'live';
let online = false;
let lastLive: RunState | null = null;  // the brain's latest state, kept while the demo plays
let feed: Feed;
let demoFeed: Feed | null = null;
let stageSince = 0;

// ---------------------------------------------------------------- page skeleton

$('#app').innerHTML = `
<section id="start" class="start">
  <div class="start-card">
    <div class="logo" aria-hidden="true"><svg viewBox="-40 -40 80 110">${builder(0, 0, 1)}</svg></div>
    <p class="eyebrow">Buildscape</p>
    <h1>What do you want to build?</h1>
    <p class="lead">Describe your idea in your own words. A builder makes the app for you, and you watch it go up like a house: one stage at a time, explained in plain language. No coding needed.</p>
    <form id="idea-form">
      <label class="sr" for="idea">Your idea</label>
      <textarea id="idea" rows="3" maxlength="600" placeholder="For example: an app to track how tall my plants grow" required></textarea>
      <div class="chips" aria-label="Example ideas">${EXAMPLES.map((e) => `<button type="button" class="chip">${esc(e)}</button>`).join('')}</div>
      <div class="start-actions">
        <button id="go" class="btn primary" type="submit">Start building</button>
        <button id="demo-btn" class="btn ghost" type="button">Watch a demo build</button>
      </div>
      <p id="start-note" class="note" role="status"></p>
    </form>
  </div>
</section>

<section id="build" class="build" hidden>
  <header class="top">
    <div class="brand">Buildscape</div>
    <div id="idea-line" class="idea-line"></div>
    <button id="sound-btn" class="btn small ghost" type="button"></button>
    <button id="stop-btn" class="btn small ghost" type="button">Stop</button>
    <button id="home-btn" class="btn small ghost" type="button">New idea</button>
  </header>
  <nav id="stepper" class="stepper" aria-label="Stages of the build"></nav>
  <main id="window" class="window">
    <div id="scene" class="scene"></div>
    <aside id="panel" class="panel"></aside>
    <div id="curtain" class="curtain" aria-hidden="true"></div>
  </main>
  <footer class="narrator">
    <div class="face" aria-hidden="true"><svg viewBox="-22 -24 44 44">${builder(0, 0, 1).replace(/<ellipse[^>]*>/, '')}</svg></div>
    <p id="now" role="status" aria-live="polite"></p>
  </footer>
  <div id="ask" class="ask" hidden></div>
  <div id="toast" class="toast" role="status" hidden></div>
  <div id="offline" class="offline" role="alert" hidden>Lost the connection to the builder. Is Buildscape still running in your terminal?</div>
</section>`;

// ---------------------------------------------------------------- drawing the build view

const liveStage = () => view!.stage;
const isDone = (id: StageId) => !!view && view.visited.includes(id) && (id !== view.stage || !!view.finished?.ok);
const tasksIn = (id: StageId) => view!.tasks.filter((t) => t.stage === id);
/** How much of a stage's drawing is visible: grows with the jobs done, complete once the builder has moved on. */
const stepsFor = (id: StageId) => (id === 'done' || isDone(id) || (view!.finished && !view!.running) ? 4 : Math.min(tasksIn(id).length, 3));

function renderStepper() {
  if (!view) return;
  $('#stepper').innerHTML = STAGES.map((s, i) => {
    const visited = view!.visited.includes(s.id);
    const cls = [isDone(s.id) ? 'done' : '', s.id === liveStage() && view!.running ? 'live' : '', s.id === shown ? 'shown' : ''].join(' ');
    return `<button type="button" class="step ${cls}" data-stage="${s.id}" ${visited ? '' : 'disabled'} ${s.id === shown ? 'aria-current="step"' : ''}>
      <span class="dot">${isDone(s.id) ? '✓' : i + 1}</span><span class="name">${s.house}</span></button>`;
  }).join('');
}

function renderScene() {
  $('#scene').innerHTML = scene(shown);
  // Let the browser paint the empty drawing first so the steps animate in.
  requestAnimationFrame(() => requestAnimationFrame(() => setSteps($('#scene'), stepsFor(shown))));
}

function renderPanel() {
  if (!view) return;
  const s = stageInfo(shown);
  const n = STAGES.findIndex((x) => x.id === shown) + 1;
  const tasks = tasksIn(shown);
  const fin = view.finished;
  let body: string;
  if (shown === 'done' && fin?.ok) {
    body = `<p class="summary">${esc(fin.summary)}</p>
      <div class="finish-actions">
        ${fin.previewUrl ? `<a class="btn primary" href="${esc(fin.previewUrl)}" target="_blank" rel="noopener">Open your app</a>` : ''}
        <button class="btn ghost" type="button" data-act="home">Build something new</button>
      </div>
      ${source === 'live' ? `<form id="change-form" class="change"><label for="change">Want something different? Ask for a change.</label>
        <textarea id="change" rows="2" maxlength="600" placeholder="For example: make the buttons bigger and add a dark theme" required></textarea>
        <button class="btn" type="submit">Ask the builder</button></form>` : ''}
      <p class="recap">${view.tasks.length} jobs done across ${view.visited.filter((v) => v !== 'done').length} stages. Click a stage above to look back at what happened there.</p>`;
  } else {
    body = `<h2>Done in this stage</h2>
      ${tasks.length ? `<ul class="tasks">${tasks.map((t) => `<li data-id="${esc(t.id)}"><span class="tick" aria-hidden="true">✓</span>${esc(t.text)}</li>`).join('')}</ul>`
        : `<p class="empty">${shown === liveStage() && view.running ? 'The builder has just arrived here. Finished jobs will show up in this list.' : 'Nothing was needed here this time.'}</p>`}
      ${fin && !fin.ok && shown === liveStage() ? `<div class="stopped"><p>${esc(fin.summary)}</p><button class="btn primary" type="button" data-act="home">Try again</button></div>` : ''}`;
  }
  $('#panel').innerHTML = `<p class="eyebrow">Stage ${n} of ${STAGES.length}</p><h1>${s.house}</h1><p class="real">${s.real}</p>
    ${body}<div class="lesson"><h2>Good to know</h2><p>${s.lesson}</p></div>`;
}

function renderNow() {
  if (!view) return;
  const el = $('#now');
  if (el.textContent === view.now) return;
  el.classList.remove('fresh');
  void el.offsetWidth; // restart the fade
  el.textContent = view.now;
  el.classList.add('fresh');
}

function renderAsk() {
  const box = $('#ask');
  const ask = view?.ask;
  if (!ask) { box.hidden = true; box.innerHTML = ''; return; }
  if (box.dataset.id === ask.id && !box.hidden) return;
  box.dataset.id = ask.id;
  box.hidden = false;
  box.innerHTML = `<div class="ask-card" role="dialog" aria-modal="true" aria-labelledby="ask-q">
    <div class="ask-face" aria-hidden="true"><svg viewBox="-30 -30 60 78">${builder(0, 0, 1, false, 'wave').replace(/<ellipse[^>]*>/, '')}</svg></div>
    <div class="bubble">
      <p class="eyebrow">Your builder has a question</p>
      <h2 id="ask-q">${esc(ask.question)}</h2>
      ${ask.details?.length ? `<ul class="ask-details">${ask.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <div class="ask-options">${ask.options.map((o, i) => `<button type="button" class="opt ${i === ask.recommended ? 'rec' : ''}" data-opt="${i}">
        <strong>${esc(o.label)}</strong><span>${esc(o.explain)}</span></button>`).join('')}</div>
    </div></div>`;
  box.querySelector<HTMLButtonElement>('.opt.rec, .opt')?.focus();
}

function renderTop() {
  if (!view) return;
  $('#idea-line').textContent = `${source === 'demo' ? 'Demo build: ' : ''}${view.idea ?? ''}`;
  $('#stop-btn').hidden = !view.running || source === 'demo';
  $('#home-btn').hidden = view.running && source === 'live';
  $('#sound-btn').textContent = sound.on ? 'Sound on' : 'Sound off';
  $('#offline').hidden = online || source === 'demo';
}

function renderAll() {
  $('#start').hidden = true;
  $('#build').hidden = false;
  $('#window').dataset.stage = shown;
  renderTop(); renderStepper(); renderScene(); renderPanel(); renderNow(); renderAsk();
}

function open(stage: StageId) {
  shown = stage;
  $('#window').dataset.stage = shown;
  renderStepper(); renderScene(); renderPanel();
}

let toastTimer = 0;
function toast(text: string) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 5000);
}

/** The short card between two stage windows: what just finished and where the builder goes next. */
async function curtain(from: StageId, to: StageId) {
  const el = $('#curtain');
  const a = stageInfo(from), b = stageInfo(to);
  const back = STAGES.findIndex((s) => s.id === to) < STAGES.findIndex((s) => s.id === from);
  el.innerHTML = to === 'done'
    ? `<p class="eyebrow">${a.house} finished</p><h2>Move-in day!</h2><p>Your app is ready to use.</p>`
    : `<p class="eyebrow">${back ? 'Back to an earlier room' : `${a.house} finished`}</p><h2>${back ? '' : 'Next: '}${b.house}</h2><p>${b.real}</p>`;
  el.classList.add('in');
  await wait(450);
  open(to);
  await wait(1250);
  el.classList.remove('in');
  await wait(350);
}

function showStart() {
  view = null;
  $('#build').hidden = true;
  $('#start').hidden = false;
  $('#ask').hidden = true;
  const go = $<HTMLButtonElement>('#go');
  go.disabled = !online;
  $('#start-note').textContent = online ? '' : 'To build your own app, start Buildscape on your computer (npm start). You can watch the demo build right now.';
}

// ---------------------------------------------------------------- the story, played at a watchable pace

const queue: StoryMsg[] = [];
let pumping = false;
let epoch = 0; // goes up when a new run or the demo replaces what is playing

function push(m: StoryMsg) {
  if (m.type === 'state') { queue.length = 0; epoch++; }
  queue.push(m);
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const mine = epoch;
    const m = queue.shift()!;
    try { await apply(m, () => mine !== epoch); } catch (err) { console.error(err); }
  }
  pumping = false;
}

async function apply(m: StoryMsg, stale: () => boolean) {
  if (m.type === 'state') {
    if (!m.data.idea) { if (!view || !view.finished) showStart(); return; }
    view = structuredClone(m.data);
    shown = view.stage;
    stageSince = performance.now();
    renderAll();
    return;
  }
  if (!view) return;
  switch (m.type) {
    case 'stage': {
      const left = MIN_STAGE_MS - (performance.now() - stageSince);
      if (left > 0) await wait(left);
      if (stale()) return;
      const from = view.stage;
      if (shown !== from) open(from);
      setSteps($('#scene'), 4); // finishing touch on the stage we are leaving
      await wait(1000);
      if (stale()) return;
      view.stage = m.stage;
      if (!view.visited.includes(m.stage)) view.visited.push(m.stage);
      sound.stage();
      await curtain(from, m.stage);
      stageSince = performance.now();
      break;
    }
    case 'now':
      view.now = m.text;
      renderNow();
      await wait(500);
      break;
    case 'task':
      if (view.tasks.some((t) => t.id === m.data.id)) break;
      view.tasks.push(m.data);
      sound.task();
      if (m.data.stage === shown) {
        renderPanel();
        $('#panel').querySelector(`li[data-id="${CSS.escape(m.data.id)}"]`)?.classList.add('new');
        setSteps($('#scene'), stepsFor(shown));
      }
      await wait(1300);
      break;
    case 'ask':
      view.ask = m.data;
      sound.ask();
      renderAsk();
      break;
    case 'answered':
      if (view.ask?.id === m.id) view.ask = null;
      renderAsk();
      break;
    case 'finished':
      view.finished = m.data;
      view.running = false;
      view.ask = null;
      if (m.data.ok) sound.finish();
      renderAll();
      break;
    case 'problem':
      sound.problem();
      toast(m.text);
      break;
  }
}

// ---------------------------------------------------------------- where the story comes from

feed = live(
  (m) => {
    if (m.type === 'state') lastLive = m.data;
    if (source === 'live') push(m);
  },
  (up) => {
    online = up;
    if (view) renderTop(); else if (source === 'live') showStart();
  },
);

async function startRun(idea: string, change = false): Promise<string | null> {
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea, change }) });
    const out = await res.json();
    return out.ok ? null : String(out.error ?? 'The builder could not start.');
  } catch {
    return 'Could not reach the builder. Is Buildscape still running in your terminal?';
  }
}

async function startDemo() {
  source = 'demo';
  try {
    demoFeed = await demo(push);
  } catch {
    source = 'live';
    $('#start-note').textContent = 'The demo could not be loaded.';
  }
}

function goHome() {
  demoFeed?.close();
  demoFeed = null;
  source = 'live';
  queue.length = 0;
  epoch++;
  view = null;
  // If the brain is in the middle of a build (started before the demo), go back to watching it.
  if (lastLive?.running) push({ type: 'state', data: lastLive }); else showStart();
}

// ---------------------------------------------------------------- clicks and typing

$('#idea-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const idea = $<HTMLTextAreaElement>('#idea').value.trim();
  if (idea.length < 3) return;
  sound.task(); // also unlocks sound in the browser
  const go = $<HTMLButtonElement>('#go');
  go.disabled = true;
  const err = await startRun(idea);
  go.disabled = !online;
  if (err) $('#start-note').textContent = err;
});
$('#idea').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $<HTMLFormElement>('#idea-form').requestSubmit();
});
document.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => c.addEventListener('click', () => {
  const box = $<HTMLTextAreaElement>('#idea');
  box.value = c.textContent ?? '';
  box.focus();
}));
$('#demo-btn').addEventListener('click', () => { sound.task(); void startDemo(); });
$('#sound-btn').addEventListener('click', () => { sound.toggle(); renderTop(); });
$('#stop-btn').addEventListener('click', () => void fetch('/api/stop', { method: 'POST' }));
$('#home-btn').addEventListener('click', goHome);

$('#stepper').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.step');
  if (btn && !btn.disabled) open(btn.dataset.stage as StageId);
});

$('#ask').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.opt');
  const id = view?.ask?.id;
  if (!btn || !id) return;
  (source === 'demo' ? demoFeed : feed)?.answer(id, Number(btn.dataset.opt));
  btn.closest('.ask-card')?.classList.add('sent');
});

$('#panel').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-act="home"]')) goHome();
});
$('#panel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = $<HTMLTextAreaElement>('#change');
  const text = box.value.trim();
  if (text.length < 3) return;
  const err = await startRun(text, true);
  if (err) toast(err);
});

showStart();
