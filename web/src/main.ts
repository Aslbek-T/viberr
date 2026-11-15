import { AGENTS, STAGES, stageInfo, type AgentId, type Ask, type Block, type MessageReply, type PlanSection, type RunState, type StageId, type StoryMsg } from '../../shared/story.ts';
import { sound } from './audio.ts';
import { COMMAND_HELP, ears, matchAnswer, parseCommand, voice, type Command } from './voice.ts';
import { demo, live, type Feed } from './net.ts';
import { builder, World } from './world.ts';
import './styles.css';

// The whole screen is driven by the friendly story messages from the brain (shared/story.ts).
// Nothing technical is ever shown: no code, no file names, no commands.

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced ? Math.min(ms, 120) : ms));
const MIN_STAGE_MS = 2500;

const EXAMPLES = [
  'A chart of how tall my plants grow each week',
  'A log of lab samples with the date and result',
  'What is the difference between what I see and what the app does?',
  'A reading list that remembers where I stopped',
];

let view: RunState | null = null;
let shown: StageId = 'plan';
let picked: Block | null = null;
let source: 'live' | 'demo' = 'live';
let online = false;
let lastLive: RunState | null = null;
let feed: Feed;
let demoFeed: Feed | null = null;
let stageSince = 0;
let suggestedFolder = '';
let sideAnswers: { q: string; a: string[] }[] = [];

const MIC = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const dictateButton = (target: string) => `<button type="button" class="btn mic-btn" data-dictate="${target}" hidden>${MIC}<span>Speak</span></button>`;
let micUsed = false;

const wordmark = `<p class="wordmark" aria-label="Vibeerr"><span class="mark" aria-hidden="true">V</span><span aria-hidden="true">Vibeerr</span></p>`;
const agentOptions = AGENTS.map((agent) => `<option value="${agent.id}">${agent.label}</option>`).join('');
const agentChoices = AGENTS.map((agent, index) => `<label class="agent-choice">
  <input type="radio" name="agent" value="${agent.id}" ${index === 0 ? 'checked' : ''}>
  <span><strong>${agent.label}</strong><small data-ready="${agent.id}">Checking this computer…</small><small>${esc(agent.blurb)}</small></span>
</label>`).join('');

$('#app').innerHTML = `
<section id="start" class="start">
  <div class="start-card">
    <div class="logo" aria-hidden="true"><svg viewBox="-40 -40 80 110">${builder(0, 0, 1)}</svg></div>
    <form id="idea-form" class="start-layout">
      <div class="prompt-main">
        ${wordmark}
        <h1>Describe the app you want.</h1>
        <p class="lead">Tell it your idea in plain words. A builder you already have writes a short plan you can edit, then makes the app while a guide explains each part. No coding needed.</p>
        <label class="sr" for="idea">Your question or idea</label>
        <textarea id="idea" rows="8" placeholder="For example: a chart of how tall my plants grow each week, with the date of each measurement" required></textarea>
        <div class="chips" aria-label="Examples">${EXAMPLES.map((example) => `<button type="button" class="chip">${esc(example)}</button>`).join('')}</div>
        <div class="start-actions">
          <button id="go" class="btn primary" type="submit">Send</button>
          ${dictateButton('idea')}
          <button id="demo-btn" class="btn ghost" type="button">Watch a demo build</button>
        </div>
        <p id="start-note" class="note" role="status"></p>
        <aside id="start-history" class="chat-history" hidden>
          ${wordmark}
          <div id="answers" class="answers" aria-live="polite"></div>
        </aside>
      </div>
      <aside class="side-setup" aria-label="Folder and AI">
        <div class="setup">
          <label for="folder">Folder</label>
          <input id="folder" class="field" type="text" autocomplete="off" spellcheck="false" placeholder="No folder chosen yet">
          <button id="folder-pick" class="btn" type="button">Choose a folder</button>
          <button id="folder-suggest" class="linkish" type="button">Use a Vibeerr folder</button>
          <p id="folder-note" class="hint" role="status">Opens your folders so you can pick where this app will live. A new folder is fine.</p>
        </div>
        <fieldset class="agents">
          <legend>Which AI do you already have?</legend>
          ${agentChoices}
        </fieldset>
      </aside>
    </form>
  </div>
</section>

<section id="build" class="build" hidden>
  <header class="top">
    <div id="idea-line" class="idea-line"></div>
    <div id="folder-line" class="folder-line"></div>
    <label class="sr" for="agent-live">Builder</label>
    <select id="agent-live" class="agent-live" aria-label="Which AI is building">${agentOptions}</select>
    <button id="voice-btn" class="btn small ghost" type="button" aria-pressed="true"></button>
    <button id="sound-btn" class="btn small ghost" type="button"></button>
    <button id="stop-btn" class="btn small ghost" type="button">Stop</button>
    <button id="reset-btn" class="btn small ghost" type="button">Start over</button>
  </header>
  <nav id="stepper" class="stepper" aria-label="Parts of the build"></nav>
  <main class="window">
    <div class="site">
      <div id="world" class="world"></div>
      <div class="narrator">
        <div class="face" aria-hidden="true"><svg viewBox="-22 -24 44 44">${builder(0, 0, 1).replace(/<ellipse[^>]*>/, '')}</svg></div>
        <p id="now" role="status" aria-live="polite"></p>
      </div>
      <div id="composer" class="composer">
        <form id="dock" class="dock">
          <label for="dock-text">Send a note while it works</label>
          <textarea id="dock-text" rows="1" placeholder="A note for the builder, or press Speak"></textarea>
          ${dictateButton('dock-text')}
          <button class="btn" type="submit">Send</button>
        </form>
      </div>
    </div>
    <div class="side">
      <aside id="panel" class="panel"></aside>
      <aside id="chat-history" class="chat-history" hidden>
        ${wordmark}
        <div id="live-answers" class="answers" aria-live="polite"></div>
      </aside>
    </div>
  </main>
  <div id="ask" class="ask" hidden></div>
  <div id="toast" class="toast" role="status" hidden></div>
  <div id="banner" class="banner" aria-hidden="true"></div>
  <div id="offline" class="offline" role="alert" hidden>Lost the connection to the builder. Is Vibeerr still running in your terminal?</div>
</section>`;

const world = new World($('#world'));
world.onPick = (block) => { picked = block; renderPanel(); $('#panel').scrollTop = 0; };

function grow(box: HTMLTextAreaElement) {
  const tall = box.id === 'idea';
  box.style.height = 'auto';
  box.style.height = `${Math.min(Math.max(box.scrollHeight, tall ? 180 : 48), tall ? 320 : 96)}px`;
}

const isDone = (id: StageId) => !!view && view.visited.includes(id) && (id !== view.stage || !!view.finished?.ok);

function renderStepper() {
  if (!view) return;
  $('#stepper').innerHTML = STAGES.map((stage, index) => {
    const cls = [isDone(stage.id) ? 'done' : '', stage.id === view!.stage && view!.running ? 'live' : '', stage.id === shown ? 'shown' : ''].join(' ');
    return `<button type="button" class="step ${cls}" data-stage="${stage.id}" style="--c:${stage.color}" ${view!.visited.includes(stage.id) ? '' : 'disabled'} ${stage.id === shown ? 'aria-current="step"' : ''}>
      <span class="dot">${isDone(stage.id) ? '✓' : index + 1}</span><span class="name">${stage.name}</span></button>`;
  }).join('');
}

function answerCard(question: string, answer: string[]) {
  return `<article class="answer"><p class="q">${esc(question)}</p><p>${esc(answer.join(' '))}</p></article>`;
}

function renderChat() {
  const html = sideAnswers.map((item) => answerCard(item.q, item.a)).join('');
  for (const id of ['#answers', '#live-answers']) {
    const box = document.querySelector<HTMLElement>(id);
    if (box) box.innerHTML = html;
  }
  for (const room of document.querySelectorAll<HTMLElement>('.chat-history')) room.hidden = sideAnswers.length === 0;
}

function guideCard(stage: StageId) {
  const info = stageInfo(stage);
  const text = view?.guides?.[stage] || info.lesson;
  return `<div class="guide-card"><h2>From your guide</h2><p>${esc(text)}</p></div>`;
}

function notesHtml() {
  const notes = view?.notes ?? [];
  if (!notes.length) return '';
  return `<h2>Notes you sent</h2><ul class="notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>`;
}


function structureHtml() {
  const structure = view?.finished?.structure ?? [];
  if (!structure.length) return '';
  return `<h2>How your app is built</h2><div class="structure">${structure.map((district) => {
    const info = stageInfo(district.stage);
    return `<div class="sdist" style="--c:${info.color}"><h3>${info.name} <span>${esc(info.real.toLowerCase())}</span></h3>
      <ul>${district.parts.map((part) => `<li><strong>${esc(part.name)}</strong>${esc(part.does)}</li>`).join('')}</ul></div>`;
  }).join('')}</div>
  <p class="flow">How they work together: you use a <b>page</b>, an <b>action</b> decides what happens, the result is <b>saved</b>, and a <b>try-out</b> makes sure the actions still work.</p>`;
}

/** Grok's second opinion on the finished app, with one button per idea to send it to the builder. */
function reviewHtml() {
  const review = view?.finished?.review;
  if (!review) return '';
  return `<div class="review"><h2>Second opinion from Grok <span class="score">${review.score}/10</span></h2>
    ${review.good.length ? `<ul class="review-good">${review.good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    ${review.ideas.map((idea, i) => `<div class="idea"><strong>${esc(idea.title)}</strong><p>${esc(idea.why)}</p>
      <button class="btn small-light" type="button" data-act="apply-idea" data-i="${i}">Ask the builder to do this</button></div>`).join('')}</div>`;
}

function renderPanel() {
  if (!view) return;
  const fin = view.finished;
  if (picked) {
    const info = stageInfo(picked.stage);
    $('#panel').innerHTML = `<button class="back" type="button" data-act="back">Back</button>
      <p class="eyebrow" style="color:${info.color}">${info.name}</p><h1>${esc(picked.name)}</h1>
      <p class="real">${esc(picked.does)}</p>
      ${picked.level > 1 ? `<p class="meta">The builder improved this part ${picked.level - 1} time${picked.level > 2 ? 's' : ''}.</p>` : ''}
      ${guideCard(picked.stage)}`;
    return;
  }
  const info = stageInfo(shown);
  const tasks = view.tasks.filter((task) => task.stage === shown);
  let body: string;
  if (shown === 'done' && fin?.ok) {
    body = `${guideCard('done')}<p class="summary">${esc(fin.summary)}</p>
      <div class="finish-actions">
        ${fin.previewUrl ? `<a class="btn primary" href="${esc(fin.previewUrl)}" target="_blank" rel="noopener">Open your app</a>` : ''}
        ${fin.handoffUrl ? `<a class="btn" href="${esc(fin.handoffUrl)}" target="_blank" rel="noopener">Guide for a developer</a>` : ''}
      </div>
      ${reviewHtml()}
      ${structureHtml()}
      ${notesHtml()}
      <p class="recap">${view.tasks.length} jobs and ${view.blocks.length} blocks. Click any block to see what it does.</p>`;
  } else {
    body = `${guideCard(shown)}
      <h2>Done here</h2>
      ${tasks.length ? `<ul class="tasks">${tasks.map((task) => `<li data-id="${esc(task.id)}"><span class="tick" aria-hidden="true">✓</span>${esc(task.text)}</li>`).join('')}</ul>`
        : `<p class="empty">${shown === view.stage && view.running ? 'The builder has just arrived. Finished jobs show up here.' : 'Nothing was needed here this time.'}</p>`}
      ${notesHtml()}
      ${fin && !fin.ok && shown === view.stage ? `<div class="stopped"><p>${esc(fin.summary)}</p>${fin.handoffUrl ? `<a class="btn" href="${esc(fin.handoffUrl)}" target="_blank" rel="noopener">Guide for a developer</a>` : ''}<button class="btn primary" type="button" data-act="reset">Start over</button></div>` : ''}`;
  }
  const index = STAGES.findIndex((stage) => stage.id === shown) + 1;
  $('#panel').innerHTML = `<p class="eyebrow" style="color:${info.color}">Part ${index} of ${STAGES.length}</p><h1>${info.name}</h1><p class="real">${info.real}</p>${body}`;
}

function renderNow() {
  if (!view) return;
  const el = $('#now');
  if (el.textContent === view.now) return;
  el.classList.remove('fresh');
  void el.offsetWidth;
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
  const editable = !!ask.editable;
  const summary = editable
    ? `<label class="sr" for="plan-summary">The one-sentence summary</label><textarea id="plan-summary" class="summary-edit">${esc(ask.summary ?? '')}</textarea>`
    : (ask.summary ? `<p class="ask-summary">${esc(ask.summary)}</p>` : '');
  const sections = ask.sections?.length ? `<div class="plan">${ask.sections.map((section, index) => `<section class="psec" style="--i:${index}">
      <h3>${esc(section.title)}</h3>
      ${editable
        ? `<div class="lines">${section.items.map((item) => `<textarea class="plan-edit">${esc(item)}</textarea>`).join('')}</div><button type="button" class="add-line" data-add>Add a line</button>`
        : `<ul>${section.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`}
    </section>`).join('')}</div>` : '';
  box.innerHTML = `<div class="ask-card${ask.sections?.length ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="ask-q">
    <div class="ask-face" aria-hidden="true"><svg viewBox="-30 -30 60 78">${builder(0, 0, 1, false, 'wave').replace(/<ellipse[^>]*>/, '')}</svg></div>
    <div class="bubble">
      <p class="eyebrow">${editable ? 'Edit the plan' : 'Your builder has a question'}</p>
      <h2 id="ask-q">${esc(ask.question)}</h2>
      ${summary}
      ${sections}
      ${ask.details?.length ? `<ul class="ask-details">${ask.details.map((detail) => `<li>${esc(detail)}</li>`).join('')}</ul>` : ''}
      <div class="ask-options">${ask.options.map((option, index) => `<button type="button" class="opt ${index === ask.recommended ? 'rec' : ''}" data-opt="${index}">
        <strong>${esc(option.label)}</strong><span>${esc(option.explain)}</span></button>`).join('')}</div>
      ${ears.ready ? `<div class="ask-voice"><button type="button" class="btn mic-btn" data-mic>${MIC}<span>Answer by voice</span></button>
        <p class="heard" role="status">${esc(`Or say “${ask.options[0]?.label ?? 'yes'}” or “${ask.options[1]?.label ?? 'no'}”.`)}</p></div>` : ''}
    </div></div>`;
  box.querySelector<HTMLButtonElement>('.opt.rec, .opt')?.focus({ preventScroll: true });
}

function renderTop() {
  if (!view) return;
  $('#idea-line').textContent = `${source === 'demo' ? 'Demo build: ' : ''}${view.idea ?? ''}`;
  const folder = $('#folder-line');
  folder.textContent = view.folder ?? '';
  folder.title = view.folder ?? '';
  const select = $<HTMLSelectElement>('#agent-live');
  if (document.activeElement !== select && view.agent) select.value = view.agent;
  select.disabled = source === 'demo';
  $('#stop-btn').hidden = !view.running || source === 'demo';
  $('#composer').hidden = source === 'demo';
  const dockLabel = $('#dock label');
  const dockBox = $<HTMLTextAreaElement>('#dock-text');
  if (view.running) {
    dockLabel.textContent = 'Send a note while it works';
    dockBox.placeholder = 'A note for the builder, or press Speak';
  } else {
    dockLabel.textContent = 'Ask for a change, or ask a question';
    dockBox.placeholder = 'A change or a question, or press Speak';
  }
  $('#sound-btn').textContent = sound.on ? 'Sound on' : 'Sound off';
  $('#voice-btn').textContent = voice.on ? 'Voice on' : 'Voice off';
  $('#voice-btn').setAttribute('aria-pressed', String(voice.on));
  $('#offline').hidden = online || source === 'demo';
}

function renderAll() {
  $('#start').hidden = true;
  $('#build').hidden = false;
  renderTop(); renderStepper(); renderPanel(); renderNow(); renderAsk(); renderChat();
}

function open(stage: StageId) {
  shown = stage;
  picked = null;
  renderStepper(); renderPanel();
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

async function banner(stage: StageId) {
  const info = stageInfo(stage);
  const el = $('#banner');
  el.innerHTML = `<span style="background:${info.color}"></span><b>${stage === 'done' ? 'All done' : `Next: ${info.name}`}</b> ${esc(info.real)}`;
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
}

function showStart() {
  view = null;
  $('#build').hidden = true;
  $('#start').hidden = false;
  renderChat();
  $('#ask').hidden = true;
  $<HTMLButtonElement>('#go').disabled = !online;
  $('#start-note').textContent = online ? '' : 'To ask or build, start Vibeerr on your computer (npm start). You can watch the demo build right now.';
}

function normalize(data: RunState): RunState {
  const next = structuredClone(data);
  next.blocks ??= [];
  next.guides ??= {};
  next.notes ??= [];
  next.agent ??= 'claude';
  next.folder ??= '';
  return next;
}

const queue: StoryMsg[] = [];
let pumping = false;
let epoch = 0;

function push(message: StoryMsg) {
  if (message.type === 'state') { queue.length = 0; epoch++; }
  queue.push(message);
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const mine = epoch;
    const message = queue.shift()!;
    try { await apply(message, () => mine !== epoch); } catch (err) { console.error(err); }
  }
  pumping = false;
}

async function apply(message: StoryMsg, stale: () => boolean) {
  if (message.type === 'state') {
    if (!message.data.idea) { if (!view || !view.finished) showStart(); return; }
    view = normalize(message.data);
    holdForAsk(view.ask?.id ?? null);
    shown = view.stage;
    picked = null;
    stageSince = performance.now();
    renderAll();
    world.reset(view.blocks, view.stage, !!view.finished?.ok);
    return;
  }
  if (!view) return;
  switch (message.type) {
    case 'stage': {
      const left = MIN_STAGE_MS - (performance.now() - stageSince);
      if (left > 0) await wait(left);
      if (stale()) return;
      view.stage = message.stage;
      if (!view.visited.includes(message.stage)) view.visited.push(message.stage);
      sound.stage();
      void banner(message.stage);
      open(message.stage);
      // The guide explains the new part while the builder walks there, and the build picks up once it has finished.
      const talk = message.stage === 'done' ? Promise.resolve() : explainAloud(view.guides?.[message.stage] || stageInfo(message.stage).lesson);
      if (message.stage !== 'done') await world.goTo(message.stage);
      await talk;
      if (stale()) return;
      stageSince = performance.now();
      break;
    }
    case 'now':
      view.now = message.text;
      renderNow();
      if (message.explain) await explainAloud(message.text);
      else { void voice.say(message.text); await wait(400); }
      break;
    case 'block': {
      const old = view.blocks.find((block) => block.id === message.data.id);
      view.blocks = old ? view.blocks.map((block) => (block.id === message.data.id ? message.data : block)) : [...view.blocks, message.data];
      sound.task();
      await world.build(message.data, `${old ? 'Improving' : 'Building'}: ${message.data.name}`);
      if (stale()) return;
      world.say('');
      break;
    }
    case 'task':
      if (view.tasks.some((task) => task.id === message.data.id)) break;
      view.tasks.push(message.data);
      if (message.data.text === 'Every check passed') world.passed();
      if (message.data.stage === shown && !picked) {
        renderPanel();
        $('#panel').querySelector(`li[data-id="${CSS.escape(message.data.id)}"]`)?.classList.add('new');
      }
      await wait(700);
      break;
    case 'ask':
      view.ask = message.data;
      sound.ask();
      renderAsk();
      holdForAsk(message.data.id);
      void speakAsk(message.data);
      break;
    case 'answered':
      if (view.ask?.id === message.id) { view.ask = null; voice.stopCutIn(); ears.stop(); holdForAsk(null); }
      renderAsk();
      break;
    case 'finished':
      view.finished = message.data;
      view.running = false;
      view.ask = null;
      holdForAsk(null);
      if (message.data.ok) {
        view.stage = 'done';
        if (!view.visited.includes('done')) view.visited.push('done');
        sound.finish();
        void voice.say(message.data.summary, true);
        void banner('done');
        shown = 'done';
        picked = null;
        renderAll();
        await world.celebrate();
      } else { renderAll(); void voice.say(message.data.summary, true); }
      break;
    case 'problem':
      sound.problem();
      toast(message.text);
      void voice.say(message.text);
      break;
    case 'guide':
      view.guides = { ...(view.guides ?? {}), [message.stage]: message.text };
      if (shown === message.stage || picked?.stage === message.stage) renderPanel();
      break;
    case 'note':
      if (view.notes.at(-1) === message.text) break;
      view.notes = [...(view.notes ?? []), message.text];
      if (!picked) renderPanel();
      break;
    case 'agent':
      view.agent = message.agent;
      renderTop();
      break;
    case 'review':
      if (!view.finished?.ok) break;
      view.finished.review = message.data;
      if (shown === 'done' && !picked) renderPanel();
      void voice.say(`Grok looked at your app and gave it ${message.data.score} out of 10.${message.data.ideas[0] ? ` One idea: ${message.data.ideas[0].title}.` : ''} The ideas are on the right.`, 'queue');
      break;
  }
}

feed = live(
  (message) => {
    if (message.type === 'state') lastLive = message.data;
    if (source === 'live') push(message);
  },
  (up) => {
    online = up;
    updateMics();
    if (view) renderTop(); else if (source === 'live') showStart();
  },
);

function chosenAgent(): AgentId {
  const value = document.querySelector<HTMLInputElement>('input[name="agent"]:checked')?.value;
  return value === 'cursor' || value === 'codex' || value === 'claude' ? value : 'claude';
}

async function send(text: string, extra?: { folder?: string; agent?: string }): Promise<MessageReply> {
  try {
    const res = await fetch('/api/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, folder: extra?.folder ?? '', agent: extra?.agent }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Could not reach the builder. Is Vibeerr still running in your terminal?' };
  }
}

async function startDemo() {
  source = 'demo';
  try { demoFeed = await demo(push); } catch {
    source = 'live';
    $('#start-note').textContent = 'The demo could not be loaded.';
  }
}

function goHome(force = false) {
  demoFeed?.close();
  demoFeed = null;
  source = 'live';
  queue.length = 0;
  epoch++;
  view = null;
  sideAnswers = [];
  renderChat();
  if (!force && lastLive?.idea && (lastLive.running || lastLive.finished)) push({ type: 'state', data: normalize(lastLive) });
  else showStart();
}

function planFromAsk(): { plan?: PlanSection[]; summary?: string } {
  const sections = [...$('#ask').querySelectorAll<HTMLElement>('.psec')].map((section) => ({
    title: section.querySelector('h3')?.textContent?.trim() ?? '',
    items: [...section.querySelectorAll<HTMLTextAreaElement>('textarea')].map((box) => box.value.trim()).filter(Boolean),
  })).filter((section) => section.title && section.items.length);
  const summary = $('#ask').querySelector<HTMLTextAreaElement>('#plan-summary')?.value.trim();
  return { plan: sections.length ? sections : undefined, summary };
}

$('#idea-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const box = $<HTMLTextAreaElement>('#idea');
  const text = box.value.trim();
  if (text.length < 3) return;
  sound.task();
  const go = $<HTMLButtonElement>('#go');
  go.disabled = true;
  $('#start-note').textContent = 'Thinking about what you mean...';
  const out = await send(text, { folder: $<HTMLInputElement>('#folder').value.trim(), agent: chosenAgent() });
  go.disabled = !online;
  $('#start-note').textContent = out.ok ? '' : out.error;
  if (!out.ok) return;
  if (out.route === 'answer') {
    sideAnswers.unshift({ q: text, a: out.answer });
    renderChat();
    void voice.say(out.answer.slice(0, 2).join(' '), true);
    box.value = '';
    grow(box);
  }
});
$('#idea').addEventListener('input', () => grow($<HTMLTextAreaElement>('#idea')));
$('#dock-text').addEventListener('input', () => grow($<HTMLTextAreaElement>('#dock-text')));
$('#idea').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) $<HTMLFormElement>('#idea-form').requestSubmit();
});
$('#folder-suggest').addEventListener('click', () => {
  const box = $<HTMLInputElement>('#folder');
  box.value = suggestedFolder || '~/Vibeerr/my-project';
  box.focus();
});
$('#folder-pick').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('#folder-pick');
  const note = $('#folder-note');
  button.disabled = true;
  note.classList.remove('warn');
  note.textContent = 'Opening your folders…';
  try {
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    const out = await res.json();
    if (out.ok && typeof out.folder === 'string') {
      $<HTMLInputElement>('#folder').value = out.folder;
      note.textContent = 'This is where the app will live.';
    } else {
      note.textContent = out.error || 'No folder was chosen.';
      note.classList.add('warn');
    }
  } catch {
    note.textContent = 'The folder window could not open. Type the folder path instead.';
    note.classList.add('warn');
  }
  button.disabled = false;
});
document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => chip.addEventListener('click', () => {
  const box = $<HTMLTextAreaElement>('#idea');
  box.value = chip.textContent ?? '';
  grow(box);
  box.focus();
}));
$('#demo-btn').addEventListener('click', () => { sound.task(); void startDemo(); });
$('#sound-btn').addEventListener('click', () => { sound.toggle(); renderTop(); });
$('#voice-btn').addEventListener('click', () => {
  const nowOn = voice.toggle();
  renderTop();
  if (nowOn) void voice.say('Voice is on. I will read each step to you.');
});
$('#stop-btn').addEventListener('click', () => void fetch('/api/stop', { method: 'POST' }));
$('#reset-btn').addEventListener('click', () => void startOver());
$<HTMLSelectElement>('#agent-live').addEventListener('change', async (event) => {
  const select = event.target as HTMLSelectElement;
  if (source === 'demo') return;
  try {
    const res = await fetch('/api/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: select.value }) });
    const out = await res.json();
    if (!out.ok) {
      toast(out.error || 'That AI could not take over.');
      if (view?.agent) select.value = view.agent;
    }
  } catch {
    toast('Could not reach the builder.');
    if (view?.agent) select.value = view.agent;
  }
});

$('#stepper').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.step');
  if (button && !button.disabled) { open(button.dataset.stage as StageId); world.focus(shown); }
});

$('#ask').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('[data-mic]')) { void hearAnswer(); return; }
  const add = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
  if (add) {
    const lines = add.parentElement?.querySelector('.lines');
    lines?.insertAdjacentHTML('beforeend', '<textarea class="plan-edit"></textarea>');
    lines?.querySelector<HTMLTextAreaElement>('textarea:last-of-type')?.focus();
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.opt');
  const id = view?.ask?.id;
  if (!button || !id) return;
  const edited = planFromAsk();
  (source === 'demo' ? demoFeed : feed)?.answer(id, Number(button.dataset.opt), edited.plan, edited.summary);
  button.closest('.ask-card')?.classList.add('sent');
});

$('#panel').addEventListener('click', (event) => {
  const act = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'reset') void startOver();
  if (act === 'back') { picked = null; renderPanel(); }
  if (act === 'apply-idea') void applyIdea(Number((event.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i));
});

$('#dock').addEventListener('submit', async (event) => {
  event.preventDefault();
  const box = $<HTMLTextAreaElement>('#dock-text');
  const text = box.value.trim();
  if (text.length < 3) return;
  const button = (event.target as HTMLFormElement).querySelector('button');
  if (button) button.disabled = true;
  const out = await send(text, { folder: view?.folder, agent: $<HTMLSelectElement>('#agent-live').value });
  if (button) button.disabled = false;
  if (!out.ok) { toast(out.error); return; }
  box.value = '';
  grow(box);
  if (out.route === 'note' || out.route === 'answer') {
    if (out.route === 'note' && view && view.notes.at(-1) !== text) {
      view.notes = [...(view.notes ?? []), text];
      if (!picked) renderPanel();
    }
    sideAnswers.unshift({ q: text, a: out.route === 'answer' ? out.answer : ['The builder will read this on the next step.'] });
    renderChat();
    if (out.route === 'answer') void voice.say(out.answer.slice(0, 2).join(' '), true);
    if (out.route === 'note') toast('Sent. The builder reads it on the next step.');
  }
});

/** Sends one of Grok's ideas to the builder as a change to the app. */
async function applyIdea(index: number) {
  const idea = view?.finished?.review?.ideas[index];
  if (!idea || source === 'demo') return;
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: idea.change, change: true, agent: view?.agent }) });
    const out = await res.json();
    if (!out.ok) toast(out.error || 'The builder could not start that change.');
  } catch { toast('Could not reach the builder.'); }
}

async function startOver() {
  if (source === 'demo') { goHome(true); return; }
  lastLive = null;
  try { await fetch('/api/reset', { method: 'POST' }); } catch { /* the screen still goes home */ }
  goHome(true);
}

async function loadReady() {
  try {
    const data = await (await fetch('/api/ready')).json();
    suggestedFolder = typeof data.folder === 'string' ? data.folder : '';
    voice.setup(data.voice === 'elevenlabs' ? 'elevenlabs' : 'browser', () => online);
    updateMics();
    for (const agent of data.agents ?? []) {
      const line = document.querySelector<HTMLElement>(`[data-ready="${agent.id}"]`);
      if (!line) continue;
      line.textContent = agent.ready ? 'Ready on this computer' : agent.detail;
      line.classList.toggle('ready', !!agent.ready);
      line.classList.toggle('missing', !agent.ready);
    }
    const first = (data.agents ?? []).find((agent: { ready?: boolean; id?: string }) => agent.ready)?.id ?? 'claude';
    const radio = document.querySelector<HTMLInputElement>(`input[name="agent"][value="${first}"]`);
    if (radio) radio.checked = true;
  } catch { /* the demo still works offline */ }
}

// ---------------------------------------------------------------- voice: questions read aloud, answered by speaking

/** Reads a question aloud. After the person has used the microphone once, it listens for the answer by itself. */
async function speakAsk(ask: Ask) {
  const labels = ask.options.map((option) => option.label);
  const lines = [ask.question, ask.summary ?? '', ...(ask.editable ? [] : (ask.details ?? []).slice(0, 1)),
    labels.length >= 2 ? `Say "${labels[0]}" or "${labels[1]}", or press a button.` : ''];
  await voice.say(lines.filter(Boolean).join(' '), true);
  if (micUsed && voice.on && ears.ready && !ears.busy && view?.ask?.id === ask.id) void hearAnswer();
}

/** Listens for "yes" or "no". The suggested choice is sent at once; any other choice must be confirmed with a press. */
async function hearAnswer() {
  const ask = view?.ask;
  const box = $('#ask');
  const mic = box.querySelector<HTMLButtonElement>('[data-mic]');
  const heardLine = box.querySelector<HTMLElement>('.heard');
  if (!ask || !mic || !heardLine) return;
  if (ears.busy) { ears.stop(); return; }
  micUsed = true;
  const labels = ask.options.map((option) => option.label);
  mic.classList.add('on');
  mic.querySelector('span')!.textContent = 'Listening… press to stop';
  heardLine.textContent = 'Listening…';
  const heard = await ears.listen();
  if (view?.ask?.id !== ask.id) return;
  mic.classList.remove('on');
  mic.querySelector('span')!.textContent = 'Answer by voice';
  if (!heard) { heardLine.textContent = 'I did not catch that. Press the microphone and try again, or press a button.'; return; }
  const choice = matchAnswer(heard, labels);
  const command = choice === null ? parseCommand(heard) : null;
  if (command && command.kind !== 'start-over') { heardLine.textContent = `I heard “${heard}”.`; runCommand(command, heard); return; }
  if (choice === null) {
    heardLine.textContent = `I heard “${heard}”. Say “${labels[0]}” or “${labels[1]}”.`;
    void voice.say(`Sorry, I did not understand. Say ${labels[0]}, or ${labels[1]}.`, true);
    return;
  }
  const button = box.querySelector<HTMLButtonElement>(`.opt[data-opt="${choice}"]`);
  if (!button) return;
  if (choice === (ask.recommended ?? 0)) {
    heardLine.textContent = `I heard “${heard}”.`;
    button.click();
    return;
  }
  // Not the suggested choice (for example allowing something hard to undo): a spoken word alone is not enough.
  box.querySelectorAll('.opt.picked').forEach((el) => el.classList.remove('picked'));
  button.classList.add('picked');
  button.focus();
  heardLine.textContent = `I heard “${heard}”. Press “${labels[choice]}” to confirm.`;
  void voice.say(`To be safe, press ${labels[choice]} to confirm.`, true);
}

/** Reads an explanation and waits for it, so the build picks up right after. Without the voice, a short pause to read it. */
async function explainAloud(text: string) {
  if (!voice.on) { await wait(Math.min(1500 + text.length * 20, 4500)); return; }
  await Promise.race([voice.say(text, 'queue'), new Promise((r) => setTimeout(r, 30_000))]);
}

function openOrPoint(url: string | undefined, selector: string, missing: string, label: string) {
  if (!url) { void voice.say(missing, true); toast(missing); return; }
  const tab = window.open(url, '_blank', 'noopener');
  if (!tab) { // the browser blocked the new tab: point at the button instead
    document.querySelector<HTMLElement>(selector)?.focus();
    void voice.say(`Press ${label} to open it.`, true);
  } else void voice.say(`Opening ${label.toLowerCase()}.`, true);
}

/** Does what a spoken command asks. Anything hard to undo only points at its button. */
function runCommand(command: Command, heard: string) {
  const say = (text: string) => { void voice.say(text, true); toast(text); };
  switch (command.kind) {
    case 'agent': {
      const label = AGENTS.find((agent) => agent.id === command.agent)?.label ?? command.agent;
      if (!view || source === 'demo') {
        const radio = document.querySelector<HTMLInputElement>(`input[name="agent"][value="${command.agent}"]`);
        if (radio) radio.checked = true;
        say(`${label} will build your app.`);
        return;
      }
      const select = $<HTMLSelectElement>('#agent-live');
      if (select.value === command.agent) { say(`${label} is already building.`); return; }
      select.value = command.agent;
      select.dispatchEvent(new Event('change'));
      say(`Switching to ${label}.`);
      return;
    }
    case 'open-app':
      openOrPoint(view?.finished?.ok ? view.finished.previewUrl : undefined, '.finish-actions .btn.primary', 'Your app is not ready yet. I will tell you when it is.', 'Open your app');
      return;
    case 'open-guide':
      openOrPoint(view?.finished?.handoffUrl, '.finish-actions .btn:not(.primary)', 'The developer guide is written at the end of the build.', 'Guide for a developer');
      return;
    case 'stop':
      if (!view?.running || source === 'demo') { say('Nothing is being built right now.'); return; }
      void fetch('/api/stop', { method: 'POST' });
      say('Stopping the builder.');
      return;
    case 'start-over':
      $('#reset-btn').focus();
      say('To be safe, press Start over to confirm.');
      return;
    case 'voice':
      if (voice.on !== command.on) voice.toggle();
      renderTop();
      if (command.on) void voice.say('Voice is on.', true);
      return;
    case 'sound':
      if (sound.on !== command.on) sound.toggle();
      renderTop();
      return;
    case 'show':
      if (!view) { say('Start a build first, then you can walk through its parts.'); return; }
      if (!view.visited.includes(command.stage as StageId)) { say('The builder has not reached that part yet.'); return; }
      open(command.stage as StageId);
      world.focus(shown);
      void voice.say(view.guides?.[shown] || stageInfo(shown).lesson, true);
      return;
    case 'where':
      void voice.say(view ? `${view.now} ${view.running ? `We are in ${stageInfo(view.stage).name}: ${stageInfo(view.stage).real.toLowerCase()}.` : ''}` : 'Nothing is being built yet. Tell me your idea.', true);
      return;
    case 'summary':
      void voice.say(view?.finished?.summary ?? 'There is no summary yet. It comes when the build is done.', true);
      return;
    case 'help':
      say(COMMAND_HELP);
      return;
    case 'demo':
      if (view) { say('Press Start over first, then ask for the demo.'); return; }
      void startDemo();
      return;
  }
  void heard;
}

// While a question is on screen, the narration waits; it carries on from where it stopped once it is answered.
let askHold: string | null = null;
function holdForAsk(id: string | null) {
  if (id && !askHold) voice.hold();
  if (!id && askHold) voice.release();
  askHold = id;
}

// While the person types a note, the narration waits, then carries on when they send it or click away.
let typingHold = false;
function holdForTyping(on: boolean) {
  if (on === typingHold) return;
  typingHold = on;
  if (on) voice.hold(); else voice.release();
}
for (const id of ['#dock-text', '#idea']) {
  const box = $<HTMLTextAreaElement>(id);
  box.addEventListener('input', () => holdForTyping(box.value.trim().length > 0));
  box.addEventListener('blur', () => holdForTyping(false));
}
$('#dock').addEventListener('submit', () => holdForTyping(false));

function updateMics() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-dictate]')) button.hidden = !ears.ready;
}

// Speak instead of typing, in the idea box and the note box.
document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-dictate]');
  if (!button) return;
  if (ears.busy) { ears.stop(); return; }
  micUsed = true;
  const box = $<HTMLTextAreaElement>(`#${button.dataset.dictate}`);
  const label = button.querySelector('span')!;
  button.classList.add('on');
  label.textContent = 'Listening… press to stop';
  const heard = await ears.listen(12000);
  button.classList.remove('on');
  label.textContent = 'Speak';
  const command = heard ? parseCommand(heard) : null;
  if (command) { runCommand(command, heard!); return; }
  if (!heard) {
    if (button.dataset.dictate === 'idea') $('#start-note').textContent = 'I did not catch that. Try again, or type it.';
    else toast('I did not catch that. Try again, or type it.');
    return;
  }
  box.value = box.value.trim() ? `${box.value.trim()} ${heard}` : heard.charAt(0).toUpperCase() + heard.slice(1);
  grow(box);
  box.focus();
});

showStart();
void loadReady();

