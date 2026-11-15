import type { BuildEvent, Concept, DecisionCard, ThemeId } from '../../../shared/events.ts';
import { AGENT_COLORS, ROOM_NAMES } from '../../../shared/themes.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setBadge(text: string, kind: 'live' | 'replay' | 'off') {
  const b = $('badge');
  b.textContent = text;
  b.dataset.kind = kind;
}

let voiceOn = false;
let lang = 'en';
export function setVoice(on: boolean, language: string) { voiceOn = on; lang = language; }

export function showCaption(text: string) {
  $('caption').textContent = text;
  if (voiceOn && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    speechSynthesis.speak(u);
  }
}

export function addStep(e: BuildEvent, theme: ThemeId) {
  const li = document.createElement('li');
  li.dataset.kind = e.kind;
  li.id = `step-${e.id}`;
  const who = AGENT_COLORS[e.source].name;
  li.innerHTML = `<span class="who" data-source="${e.source}">${who}</span> <span class="where">${ROOM_NAMES[theme][e.room]}</span><div class="what"></div>`;
  (li.querySelector('.what') as HTMLElement).textContent = e.summary;
  const list = $('steps');
  list.prepend(li);
  while (list.children.length > 60) list.lastElementChild?.remove();
}

export function attachNarration(eventId: string, text: string) {
  const li = document.getElementById(`step-${eventId}`);
  if (!li || li.querySelector('.plain')) return;
  const p = document.createElement('div');
  p.className = 'plain';
  p.textContent = text;
  li.appendChild(p);
}

export function clearSteps() { $('steps').innerHTML = ''; }

export function showConcept(c: Concept & { seenBefore: boolean }, theme: ThemeId, onLearned: (id: string) => void) {
  const box = $('concepts');
  const card = document.createElement('article');
  card.className = 'concept';
  card.innerHTML = `
    <div class="concept-kicker">${c.seenBefore ? 'You learned this before' : 'New idea'}</div>
    <h3></h3><p class="one"></p><p class="analogy"></p>
    <button type="button">Got it</button>`;
  (card.querySelector('h3') as HTMLElement).textContent = c.title;
  (card.querySelector('.one') as HTMLElement).textContent = c.oneLiner;
  (card.querySelector('.analogy') as HTMLElement).textContent = c.analogy[theme];
  const close = () => { card.remove(); onLearned(c.id); };
  (card.querySelector('button') as HTMLButtonElement).onclick = close;
  box.prepend(card);
  while (box.children.length > 2) box.lastElementChild?.remove();
  setTimeout(() => card.isConnected && card.remove(), c.seenBefore ? 5000 : 15000);
}

export function showDecision(card: DecisionCard, onPick: (option: number) => void) {
  const m = $('decision');
  m.innerHTML = `<div class="sheet">
    <div class="concept-kicker">Your agent needs you</div>
    <h2 id="decision-q"></h2><div class="options"></div></div>`;
  (m.querySelector('#decision-q') as HTMLElement).textContent = card.question;
  const opts = m.querySelector('.options') as HTMLElement;
  card.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option' + (i === card.recommended ? ' recommended' : '');
    b.innerHTML = `<strong></strong>${i === card.recommended ? '<span class="rec">Recommended</span>' : ''}<span class="explain"></span>`;
    (b.querySelector('strong') as HTMLElement).textContent = o.label;
    (b.querySelector('.explain') as HTMLElement).textContent = o.explain;
    b.onclick = () => { m.hidden = true; onPick(i); };
    opts.appendChild(b);
  });
  m.hidden = false;
  (opts.querySelector('button') as HTMLButtonElement)?.focus();
  try { navigator.vibrate?.(200); } catch { /* ignore */ }
}
