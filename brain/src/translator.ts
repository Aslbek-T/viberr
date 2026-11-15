import { stageInfo, type StageId } from '../../shared/story.ts';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.ts';
import { humanName, type Raw } from './stages.ts';

// The translator sits between the coding agent and the person.
// It reads the raw steps (files, commands, the agent's own notes) and writes what a person with no
// coding background should hear. With GEMINI_API_KEY it uses Gemini; without it, or if a call fails,
// it uses built-in sentences so the app always works.

export const narratorKind = (): 'gemini' | 'template' => (GEMINI_API_KEY ? 'gemini' : 'template');

const GUIDE = `You are the friendly guide inside Buildscape, an app that lets people with NO coding background
watch an AI builder make their app. The build is shown as building a house in stages:
Blueprint (planning), Foundation (project setup), Walls and windows (the screens people see),
Wiring (the rules that make it work), Storage room (saving information), Inspection (checking it works),
Move-in day (ready).

You receive the builder's raw technical activity. Rewrite it for the person. Rules:
- NEVER mention file names, code, commands, programming languages, libraries or tools by name.
- No jargon. If a real term helps them learn (frontend, database, test), explain it in the same sentence.
- Talk about THEIR app and what it will let them do. Be concrete, warm and brief. No emojis. No hype.
- Use the house picture lightly, at most once per sentence.`;

// Model ids change often, so we try a short list and keep the first one that answers.
// Set GEMINI_MODEL in .env to force one.
// The lite model is first: it is fast and plenty for one friendly sentence.
const CANDIDATES = [GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite']
  .filter((m, i, all) => m && all.indexOf(m) === i);
let modelAt = 0;
let warned = false;
export const geminiModel = () => CANDIDATES[modelAt];

async function callGemini(model: string, prompt: string, maxMs: number): Promise<any> {
  const body: any = {
    systemInstruction: { parts: [{ text: GUIDE }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 2000 },
  };
  if (/2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 }; // answer fast, no long thinking
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(maxMs),
  });
  if (!res.ok) throw Object.assign(new Error(`Gemini (${model}) answered ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
}

async function gemini(prompt: string, maxMs = 9000): Promise<any | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    return await callGemini(CANDIDATES[modelAt], prompt, maxMs);
  } catch (err: any) {
    // Unknown model or no free quota for it: move on to the next one for the following calls.
    if ([400, 404, 429].includes(err?.status) && modelAt < CANDIDATES.length - 1) modelAt++;
    if (!warned) { console.warn(`[guide] Gemini did not answer, using built-in sentences for this step. ${String(err?.message ?? err).slice(0, 240)}`); warned = true; }
    return null;
  }
}

/** One tiny call at startup so the terminal says clearly whether the Gemini key works. */
export async function checkGemini(): Promise<string> {
  if (!GEMINI_API_KEY) return 'built-in sentences (add GEMINI_API_KEY to .env for smarter explanations)';
  for (let i = 0; i < CANDIDATES.length; i++) {
    try {
      await callGemini(CANDIDATES[i], 'Reply with JSON: {"ok": true}', 12000);
      modelAt = i;
      return `Gemini is working (${CANDIDATES[i]})`;
    } catch (err: any) {
      console.warn(`[guide] ${String(err?.message ?? err).slice(0, 200)}`);
      if (err?.status === 401 || err?.status === 403) break; // the key itself is wrong
    }
  }
  return 'Gemini did not answer, so built-in sentences are used. Check GEMINI_API_KEY in .env.';
}

const clean = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';

function describe(items: Raw[]): string {
  return items.slice(-12).map((r) => {
    switch (r.kind) {
      case 'write': return `- wrote file ${r.file}${r.snippet ? `, starting with: ${r.snippet.slice(0, 900)}` : ''}`;
      case 'pass': return '- all the automatic checks passed';
      case 'read': return `- read ${r.file ?? 'some files'}`;
      case 'run': return `- ran command: ${r.command}`;
      case 'problem': return `- hit a problem: ${r.text ?? r.command ?? ''}`;
      case 'note': return `- builder's note: ${r.text?.slice(0, 300)}`;
      default: return `- ${r.kind}: ${r.text ?? ''}`;
    }
  }).join('\n');
}

export interface StepWords { now: string; tasks: string[] }

/** Words for one batch of activity in one stage. */
export async function translateStep(idea: string, stage: StageId, items: Raw[], doneSoFar: string[]): Promise<StepWords> {
  const fallback = templateStep(stage, items);
  const s = stageInfo(stage);
  const out = await gemini(`The person asked for: "${idea}"
Current stage: ${s.house} (${s.real}).
Already told them: ${doneSoFar.slice(-6).join('; ') || 'nothing yet'}

Raw activity:
${describe(items)}

Reply with JSON: {"now": string, "tasks": string[]}
"now": one sentence (max 24 words), present tense, saying what the builder is doing right now and why it matters for their app.
"tasks": 1 to 3 finished to-do items (max 9 words each), past tense, specific to their app, e.g. "Added the button to save a new plant". Do not repeat what they were already told. Use [] if nothing new was finished.`);
  if (!out) return fallback;
  const tasks = Array.isArray(out.tasks) ? out.tasks.map((t: unknown) => clean(t, 90)).filter(Boolean).slice(0, 3) : [];
  return { now: clean(out.now, 220) || fallback.now, tasks: tasks.length ? tasks : fallback.tasks };
}

/** Turns the builder's plan into a few friendly bullets for the "go ahead?" card. */
export async function translatePlan(idea: string, planText: string): Promise<string[]> {
  const fallback = planText.split('\n').map((l) => l.replace(/^[\s#>*\-\d.)]+/, '').replace(/[`*_]/g, '').trim())
    .filter((l) => l.length > 3).slice(1, 6).map((l) => l.slice(0, 140));
  const out = await gemini(`The person asked for: "${idea}"
The builder wrote this plan:
${planText.slice(0, 1500)}

Reply with JSON: {"bullets": string[]}
3 to 5 bullets, each max 14 words, each saying one thing the app will let the person do, in everyday words.`);
  const bullets = Array.isArray(out?.bullets) ? out.bullets.map((b: unknown) => clean(b, 140)).filter(Boolean).slice(0, 5) : [];
  return bullets.length ? bullets : fallback.length ? fallback : ['Build the first simple version of your idea.'];
}

/** The closing words on move-in day. */
export async function translateFinish(idea: string, resultText: string, tasks: string[], ok: boolean, change = false): Promise<string> {
  const fallback = !ok ? 'The builder stopped before finishing. You can ask it to continue or describe what you want changed.'
    : change ? 'Your change is in. Open your app to see it, and ask for another change any time.'
    : `Your app is ready. The builder finished ${tasks.length} jobs, from the blueprint to the final inspection. Open it and try it out, then ask for any change you like.`;
  if (!ok) return fallback;
  const out = await gemini(`The person asked for: "${idea}"
${change ? 'They asked for a change to their existing app. ' : ''}The builder finished and reported: ${resultText.slice(0, 1200)}
Jobs done: ${tasks.slice(-14).join('; ')}

Reply with JSON: {"summary": string}
2 or 3 short sentences: what their app can do now and how to try it. Everyday words only.`, 8000);
  return clean(out?.summary, 500) || fallback;
}

// ---------------------------------------------------------------- built-in sentences (no key needed)

const NOW: Record<StageId, string[]> = {
  plan: [
    'Your builder is reading your idea and drawing the blueprint: a short list of what your app should do.',
    'Before building anything, your builder is planning. A clear plan keeps the whole house standing.',
  ],
  setup: [
    'Your builder is laying the foundation: giving the project a home and a toolbox.',
    'The foundation is going in. Nothing is visible yet, but everything else will stand on it.',
  ],
  look: [
    'The walls and windows are going up: these are the screens you will see and touch.',
    'Your builder is shaping what the app looks like. Developers call this part the "frontend".',
  ],
  logic: [
    'Now the wiring: the rules that decide what happens when you tap a button.',
    'Your builder is connecting the buttons to what they should do. You never see this part, but nothing works without it.',
  ],
  memory: [
    'Your builder is fitting out the storage room, so the app remembers your information tomorrow.',
    'The app is learning to remember things. The place where information is kept is called a "database".',
  ],
  check: [
    'Inspection time: your builder is running small automatic checks to make sure everything works.',
    'Your builder is testing its own work, so a later change cannot quietly break something.',
  ],
  done: ['Move-in day. Your app is ready.'],
};

// Friendly verbs for the names builders give to the small jobs inside an app.
const VERBS: Record<string, string> = {
  add: 'add', create: 'add', remove: 'remove', delete: 'remove', save: 'save', load: 'load', show: 'show', render: 'show',
  display: 'show', calculate: 'work out', compute: 'work out', calc: 'work out', update: 'update', sort: 'sort', filter: 'filter',
  search: 'search', find: 'find', count: 'count', edit: 'edit', toggle: 'switch', mark: 'mark', clear: 'clear', reset: 'reset',
  start: 'start', stop: 'stop', check: 'check', validate: 'check', complete: 'complete', pick: 'pick', draw: 'draw',
};
const splitName = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
const uniq = (list: string[]) => [...new Set(list)];
const names = (code: string) => [...code.matchAll(/(?:function\s+|const\s+|let\s+)([A-Za-z_]\w{3,40})\s*(?:=\s*(?:async\s*)?(?:\(|function)|\()/g)].map((m) => m[1]);

/** "addPlant", "calculateGrowth" -> ["add plant", "work out growth"] */
function jobs(code: string): string[] {
  return uniq(names(code).map(splitName).filter((w) => w.length >= 2 && w.length <= 4 && VERBS[w[0]] && !/^(save|load)$/.test(w[0]))
    .map((w) => `${VERBS[w[0]]} ${/^(add|remove|edit|find|pick|mark|complete)$/.test(VERBS[w[0]]) && !w.at(-1)!.endsWith('s') ? (/^[aeiou]/.test(w[1]) ? 'an ' : 'a ') : ''}${w.slice(1).join(' ')}`));
}
/** "savePlants", "loadPlants" -> ["plants"] */
function remembered(code: string): string[] {
  return uniq(names(code).map(splitName).filter((w) => w.length >= 2 && w.length <= 3 && /^(save|load|store|read|write)$/.test(w[0]))
    .map((w) => w.slice(1).join(' ')).filter((n) => !/^(state|data|all|json|storage|store|items?|from|to)\b/.test(n)));
}
const text = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/[^\p{L}\p{N} ,.!?'-]/gu, '').replace(/\s+/g, ' ').trim();

function tasksFor(stage: StageId, r: Raw): string[] {
  const f = r.file ?? '';
  const code = r.snippet ?? '';
  if (r.kind === 'pass') return ['Every check passed'];
  if (r.kind === 'problem') return ['Found a problem and went back to fix it'];
  if (r.kind === 'run') {
    if (stage === 'check') return ['Ran all the checks'];
    if (stage === 'setup') return [/install|add/.test(r.command ?? '') ? 'Brought in ready-made parts' : 'Prepared the building site'];
    return [];
  }
  if (r.kind !== 'write') return [];
  switch (stage) {
    case 'plan': return ['Wrote down the plan for your app'];
    case 'setup':
      return /package\.json$/i.test(f)
        ? ['Gave your project a name and a home', ...(/"test"/.test(code) ? ['Got the toolbox ready for checking the work later'] : [])]
        : ['Set up the project and its toolbox'];
    case 'look': {
      if (/\.(css|scss)$/i.test(f)) return ['Chose the colors and the layout', ...(/@media/.test(code) ? ['Made it fit on a phone screen too'] : [])];
      const title = text(code.match(/<h1[^>]*>([\s\S]{2,60}?)<\/h1>/i)?.[1] ?? code.match(/<title>([^<]{2,60})<\/title>/i)?.[1] ?? '');
      const buttons = uniq([...code.matchAll(/<button[^>]*>([\s\S]{2,40}?)<\/button>/gi)].map((m) => text(m[1])).filter((b) => b.length > 1)).slice(0, 2);
      const box = text(code.match(/placeholder="([^"]{2,40})"/i)?.[1] ?? '');
      const out = [/index\.html?$/i.test(f) || title ? (title ? `Built the main screen: ${title}` : 'Built the main screen') : `Built the "${humanName(f)}" part of the screen`];
      for (const b of buttons) out.push(`Added the "${b}" button`);
      if (box && out.length < 3) out.push('Added a box where you can type');
      return out;
    }
    case 'logic': {
      const j = jobs(code).slice(0, 3).map((x) => `Taught the app how to ${x}`);
      return j.length ? j : [/^(app|main|script|index)$/.test(humanName(f)) ? 'Connected the buttons to what they do' : `Taught the app how to handle "${humanName(f)}"`];
    }
    case 'memory': {
      const n = remembered(code).slice(0, 2).map((x) => `Taught the app to remember your ${x}`);
      return ['Made a safe place to keep your information', ...n];
    }
    case 'check': {
      const checks = uniq([...code.matchAll(/(?:test|it|check|describe)\(\s*(['"`])(.{6,60}?)\1/g)].map((m) => text(m[2]))).slice(0, 2);
      return ['Wrote checks for the important parts', ...checks.map((c) => `Check: ${c}`)];
    }
  }
  return [];
}

let turn = 0;
function templateStep(stage: StageId, items: Raw[]): StepWords {
  const now = NOW[stage][turn++ % NOW[stage].length];
  return { now, tasks: uniq(items.flatMap((r) => tasksFor(stage, r))).slice(0, 4) };
}
