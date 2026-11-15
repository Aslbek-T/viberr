import { stageInfo, type PlanSection, type StageId } from '../../shared/story.ts';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.ts';
import { humanName, type Raw } from './stages.ts';

// The translator sits between the coding agent and the person.
// It reads the raw steps (files, commands, the agent's own notes) and writes what a person with no
// coding background should hear. With GEMINI_API_KEY it uses Gemini; without it, or if a call fails,
// it uses built-in sentences so the app always works.

export const narratorKind = (): 'gemini' | 'template' => (GEMINI_API_KEY ? 'gemini' : 'template');

const GUIDE = `You are the friendly guide inside Buildscape, an app that lets people with NO coding background
watch an AI builder (Claude Code) make their app. The build is shown as a building site where every part of
the app is a block in a district: Plan, Toolbox (project setup), Screens (what people see, the "frontend"),
Rules (what happens when you tap, the "logic"), Memory (saving information, the "database"),
Checks (automatic "tests"), Ready.

You receive the builder's raw technical activity. Rewrite it for the person. Rules:
- NEVER mention file names, code, commands, programming languages, libraries or tools by name.
- No jargon. If a real term helps them learn (frontend, database, test), explain it in the same sentence.
- Talk about THEIR app and what it will let them do. Be concrete, warm and brief. No emojis. No hype.
- Help them learn how apps are structured: which part does what, and how the parts talk to each other.`;

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

export interface BlockWords { file: string; name: string; does: string }
export interface StepWords { now: string; tasks: string[]; blocks: BlockWords[] }

/** Words for one batch of activity in one stage. */
export async function translateStep(idea: string, stage: StageId, items: Raw[], doneSoFar: string[]): Promise<StepWords> {
  const fallback = templateStep(stage, items);
  const s = stageInfo(stage);
  const files = uniq(items.filter((r) => r.kind === 'write' && r.file).map((r) => r.file!));
  const out = await gemini(`The person asked for: "${idea}"
Current district: ${s.name} (${s.real}).
Already told them: ${doneSoFar.slice(-6).join('; ') || 'nothing yet'}

Raw activity:
${describe(items)}

Reply with JSON: {"now": string, "tasks": string[], "blocks": [{"file": string, "name": string, "does": string}]}
"now": one sentence (max 24 words), present tense, saying what the builder is doing right now and why it matters for their app.
"tasks": 1 to 3 finished to-do items (max 9 words each), past tense, specific to their app, e.g. "Added the button to save a new plant". Do not repeat what they were already told. Use [] if nothing new was finished.
"blocks": one entry for each of these written files: ${files.length ? files.join(', ') : '(none, use [])'}.
  "file" is the file exactly as given (it is never shown). "name" is 2 or 3 everyday words for that part of the app, like "Main screen", "Colors and layout", "Point rules", "Memory box". "does" is one sentence (max 20 words) on what that part does for their app and which other part it works with.`);
  if (!out) return fallback;
  const tasks = Array.isArray(out.tasks) ? out.tasks.map((t: unknown) => clean(t, 90)).filter(Boolean).slice(0, 3) : [];
  const blocks: BlockWords[] = fallback.blocks.map((b) => {
    const g = Array.isArray(out.blocks) ? out.blocks.find((x: any) => x?.file === b.file) : null;
    const name = clean(g?.name, 32).replace(/\.[a-z]{1,5}\b/gi, '');
    return { file: b.file, name: name || b.name, does: clean(g?.does, 200) || b.does };
  });
  return { now: clean(out.now, 220) || fallback.now, tasks: tasks.length ? tasks : fallback.tasks, blocks };
}

// ---------------------------------------------------------------- the plan

/** The headings the builder is asked to use in PLAN.md (see RULES in runner.ts). */
export const PLAN_HEADINGS = [
  'What you will be able to do',
  'The screens',
  'What happens when you tap',
  'What it remembers',
  'How I will check it works',
  'The parts I will build',
];

export interface PlanWords { title: string; summary: string; sections: PlanSection[] }

/** Reads PLAN.md as written: a title, a summary line, then "## heading" sections of bullets. */
export function parsePlan(planText: string): PlanWords {
  const lines = planText.split('\n');
  let title = '';
  const intro: string[] = [];
  const sections: PlanSection[] = [];
  const strip = (l: string) => l.replace(/^[\s>*\-\d.)]+/, '').replace(/[`*_]/g, '').trim();
  for (const line of lines) {
    if (/^#\s/.test(line)) { title ||= strip(line.replace(/^#\s*/, '')); continue; }
    if (/^#{2,}\s/.test(line)) { sections.push({ title: strip(line.replace(/^#+\s*/, '')), items: [] }); continue; }
    const t = strip(line);
    if (t.length < 3) continue;
    if (sections.length) sections.at(-1)!.items.push(t.slice(0, 220));
    else intro.push(t);
  }
  const kept = sections.filter((s) => s.items.length).map((s) => ({ ...s, items: s.items.slice(0, 8) }));
  if (!kept.length && intro.length > 1) kept.push({ title: 'What you will be able to do', items: intro.slice(1, 7) });
  return { title, summary: intro[0] ?? '', sections: kept.slice(0, 7) };
}

/** The full plan for the "go ahead?" card: every section the builder wrote, in plain words. */
export async function translatePlan(idea: string, planText: string): Promise<PlanWords> {
  const parsed = parsePlan(planText);
  const fallback: PlanWords = parsed.sections.length ? parsed
    : { title: '', summary: '', sections: [{ title: 'What you will be able to do', items: ['Build the first simple version of your idea.'] }] };
  const out = await gemini(`The person asked for: "${idea}"
The builder wrote this plan:
${planText.slice(0, 4000)}

Rewrite it for the person, keeping EVERY detail and the same sections, but in everyday words a non-coder understands.
Replace any technical word with a plain one, or explain it in the same bullet. Never mention file names or code.
Reply with JSON: {"summary": string, "sections": [{"title": string, "items": string[]}]}
"summary": one sentence on what the app is. Each item max 25 words.`, 12000);
  const sections: PlanSection[] = Array.isArray(out?.sections)
    ? out.sections.map((s: any) => ({ title: clean(s?.title, 60), items: Array.isArray(s?.items) ? s.items.map((i: unknown) => clean(i, 220)).filter(Boolean).slice(0, 8) : [] }))
      .filter((s: PlanSection) => s.title && s.items.length).slice(0, 7)
    : [];
  return sections.length ? { title: parsed.title, summary: clean(out?.summary, 220) || parsed.summary, sections } : fallback;
}

/** The closing words on the Ready screen. */
export async function translateFinish(idea: string, resultText: string, tasks: string[], ok: boolean, change = false): Promise<string> {
  const fallback = !ok ? 'The builder stopped before finishing. You can ask it to continue or describe what you want changed.'
    : change ? 'Your change is in. Open your app to see it, and ask for another change any time.'
    : `Your app is ready. The builder finished ${tasks.length} jobs, from the plan to the final checks. Open it and try it out, then ask for any change you like.`;
  if (!ok) return fallback;
  const out = await gemini(`The person asked for: "${idea}"
${change ? 'They asked for a change to their existing app. ' : ''}The builder finished and reported: ${resultText.slice(0, 1200)}
Jobs done: ${tasks.slice(-14).join('; ')}

Reply with JSON: {"summary": string}
2 or 3 short sentences: what their app can do now and how to try it. Everyday words only.`, 8000);
  return clean(out?.summary, 500) || fallback;
}

/** Answers a plain question for someone who does not code. Null when Gemini is not available. */
export async function answerWithGemini(question: string, context: string): Promise<string[] | null> {
  const out = await gemini(`${context ? `They are working on this app: ${context}\n` : ''}The person asks: "${question}"

Answer like a patient teacher talking to someone who has never coded. You MAY name real technical terms here,
but explain each one in the same sentence. Use a small everyday comparison when it helps.
Reply with JSON: {"answer": string[]} with 2 to 5 short paragraphs (max 60 words each).`, 15000);
  const answer = Array.isArray(out?.answer) ? out.answer.map((a: unknown) => clean(a, 500)).filter(Boolean).slice(0, 6) : [];
  return answer.length ? answer : null;
}

/** Decides what the person meant. Null when Gemini is not available or unsure. */
export async function routeWithGemini(text: string, hasApp: boolean): Promise<'question' | 'build' | 'change' | null> {
  const out = await gemini(`Someone typed this into Buildscape: "${text}"
${hasApp ? 'They already have an app built in Buildscape.' : 'They have not built an app yet.'}
Decide what they want:
- "question": they want an explanation or advice (how something works, what a word means, what to build). Nothing should be built.
- "build": they describe a NEW app, website, game or tool they want made.
${hasApp ? '- "change": they want something added to, removed from or changed in their existing app.\n' : ''}Reply with JSON: {"route": "question" | "build"${hasApp ? ' | "change"' : ''}}`, 6000);
  const r = out?.route;
  return r === 'question' || r === 'build' || (hasApp && r === 'change') ? r : null;
}

// ---------------------------------------------------------------- built-in sentences (no key needed)

const NOW: Record<StageId, string[]> = {
  plan: [
    'Your builder is reading your idea and writing the plan: what you can do, which screens you see and what it remembers.',
    'Before building anything, your builder is planning. A clear plan decides which blocks go in each district.',
  ],
  setup: [
    'Your builder is filling the toolbox: giving the project a name, a folder and its tools.',
    'The toolbox is being set up. You will not see it, but every other block depends on it.',
  ],
  look: [
    'Your builder is placing blocks in the Screens district: the pages and buttons you will see and touch.',
    'Your builder is shaping what the app looks like. Developers call this part the "frontend".',
  ],
  logic: [
    'Now the Rules district: what should happen when you tap each button.',
    'Your builder is connecting the buttons to what they should do. Screens pass your taps to these rules.',
  ],
  memory: [
    'Your builder is building the Memory district, so the app remembers your information tomorrow.',
    'The app is learning to keep things. The rules save into this memory and load from it.',
  ],
  check: [
    'Checks time: your builder is writing small automatic tests that try the rules with example information.',
    'Your builder is testing its own work, so a later change cannot quietly break something.',
  ],
  done: ['Your app is ready.'],
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
  const files = uniq(items.filter((r) => r.kind === 'write' && r.file).map((r) => r.file!));
  return { now, tasks: uniq(items.flatMap((r) => tasksFor(stage, r))).slice(0, 4), blocks: files.map((f) => blockFor(stage, f)) };
}

/** A plain name and job for one part of the app, when no guide model is available. */
export function blockFor(stage: StageId, file: string): BlockWords {
  const base = (file.split('/').pop() ?? file).toLowerCase();
  const known: [RegExp, string, string][] = [
    [/^package\.json$/, 'Project card', 'Holds the app\'s name and how to run its checks. Every tool reads it first.'],
    [/^index\.html?$/, 'Main screen', 'The page you see first: the headings, boxes and buttons. Your taps go from here to the rules.'],
    [/\.(css|scss)$/, 'Colors and layout', 'Decides colors, sizes and spacing for every screen, including on a phone.'],
    [/^(app|main|script|index)\.(js|ts|mjs)$/, 'Button rules', 'Decides what happens when you tap a button, and asks the memory box to save the result.'],
    [/(storage|store|db|database|data)/, 'Memory box', 'Saves your information and loads it again next time, so nothing is lost when you close the page.'],
    [/(test|spec)/, 'Automatic checks', 'Tries the rules with example information and shouts if any answer is wrong.'],
    [/^readme/, 'Instructions', 'Explains what the app is and how to open it.'],
    [/^project_guide/, 'Developer guide', 'A map of the app for any developer who joins later.'],
  ];
  for (const [re, name, does] of known) if (re.test(base)) return { file, name, does };
  const words = humanName(file);
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  const does: Record<StageId, string> = {
    plan: 'Part of the plan.', setup: 'Part of the project\'s toolbox.', look: 'Part of what you see on screen.',
    logic: 'One of the rules behind the buttons.', memory: 'Helps the app remember your information.',
    check: 'An automatic check that the rules work.', done: 'Part of your app.',
  };
  return { file, name: name.slice(0, 32), does: does[stage] };
}
