import { stageInfo, type PlanSection, type StageId } from '../../shared/story.ts';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.ts';
import { humanName, type Raw } from './stages.ts';

// The translator sits between the coding agent and the person.
// It reads the raw steps (files, commands, the agent's own notes) and writes what a person with no
// coding background should hear. With GEMINI_API_KEY it uses Gemini; without it, or if a call fails,
// it uses built-in sentences so the app always works.

export const narratorKind = (): 'gemini' | 'template' => (GEMINI_API_KEY ? 'gemini' : 'template');

const GUIDE = `You are the friendly guide inside Vibeerr, an app for scientists and other people who do not code.
They watch an AI builder make their app. The build is shown as a building site. The parts are named in
everyday words: Idea, Start (getting a folder ready), Pages (what they see and tap), Actions (what happens
when they use it), Saved (what is still there tomorrow), Try out (making sure it works), Done.

You receive the builder's raw technical activity. Rewrite it for the person. Rules:
- NEVER mention file names, code, commands, programming languages, libraries or tools by name.
- No jargon. If a real term helps them learn (frontend, database, test), explain it in the same sentence.
- Talk about THEIR app and what it will let them do. Be concrete, warm and brief. No emojis. No hype.
- Help them learn how apps are structured: which part does what, and how the parts talk to each other.`;

// Model ids change often. The "latest" aliases and Gemini 2.5 are overloaded or closed to new keys,
// so the list starts with models that still answer a free key. Set GEMINI_MODEL in .env to force one.
const CANDIDATES = [GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']
  .filter((m, i, all) => m && all.indexOf(m) === i);
let modelAt = 0;
let warned = false;
export const geminiModel = () => CANDIDATES[modelAt] ?? '';

/** A miss we can survive by asking the next model: overload, a retired id, or a hung call. */
function skipModel(err: any): boolean {
  const status = err?.status;
  const message = String(err?.message ?? err);
  if (status === 404 || status === 429 || status === 500 || status === 503) return true;
  if (status === 400 && /model|not found|no longer available/i.test(message)) return true;
  return /timeout|aborted/i.test(message);
}

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
  if (!GEMINI_API_KEY || !CANDIDATES.length) return null;
  let last = 'Gemini did not answer';
  for (let i = modelAt; i < CANDIDATES.length; i++) {
    try {
      const out = await callGemini(CANDIDATES[i], prompt, maxMs);
      modelAt = i;
      return out;
    } catch (err: any) {
      last = String(err?.message ?? err);
      if (err?.status === 401 || err?.status === 403 || !skipModel(err)) break;
      if (i < CANDIDATES.length - 1) modelAt = i + 1;
    }
  }
  if (!warned) { console.warn(`[guide] Gemini did not answer, using built-in sentences for this step. ${last.slice(0, 240)}`); warned = true; }
  return null;
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
      console.warn(`[guide] ${String(err?.message ?? err).slice(0, 180)}`);
      if (err?.status === 401 || err?.status === 403) break; // the key itself is wrong
      if (!skipModel(err)) break;
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

/** The only headings a person is asked to read and edit. The builder's own checklist stays off this card. */
export const PLAN_HEADINGS = [
  'What you can do',
  'What you will see',
  'What happens when you use it',
  'What it keeps',
];

const PERSON_SECTIONS: { title: string; match: RegExp }[] = [
  { title: 'What you can do', match: /can do|able to do|feature/i },
  { title: 'What you will see', match: /will see|screen|page/i },
  { title: 'What happens when you use it', match: /happen|when you use|tap|button/i },
  { title: 'What it keeps', match: /keep|remember|save/i },
];

/** Drops builder notes (files, checks, parts lists) so the person only edits decisions they understand. */
export function personPlan(plan: PlanWords): PlanWords {
  const sections = PERSON_SECTIONS.map((want) => {
    const found = plan.sections.find((section) => want.match.test(section.title));
    return found ? { title: want.title, items: found.items.slice(0, 6) } : null;
  }).filter((section): section is PlanSection => !!section && section.items.length > 0);
  const skip = /part|check|toolbox|file|test|folder/i;
  const fallback = plan.sections.filter((section) => !skip.test(section.title)).slice(0, 4);
  return { ...plan, sections: sections.length ? sections : fallback };
}

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

/** The plan card: only the decisions a scientist can read and change. */
export async function translatePlan(idea: string, planText: string): Promise<PlanWords> {
  const parsed = personPlan(parsePlan(planText));
  const fallback: PlanWords = parsed.sections.length ? parsed
    : { title: '', summary: '', sections: [{ title: 'What you can do', items: ['Build the first simple version of your idea.'] }] };
  const out = await gemini(`The person asked for: "${idea}"
The builder wrote this plan:
${planText.slice(0, 4000)}

Rewrite it for a scientist who does not code. Keep ONLY decisions they can change. Use exactly these sections when you have something to say:
"What you can do", "What you will see", "What happens when you use it", "What it keeps".
Drop file names, tool names, checks, and any list of parts the builder will create.
Reply with JSON: {"summary": string, "sections": [{"title": string, "items": string[]}]}
"summary": one sentence on what the app is. Each item max 25 words. Everyday words only.`, 12000);
  const sections: PlanSection[] = Array.isArray(out?.sections)
    ? out.sections.map((s: any) => ({ title: clean(s?.title, 60), items: Array.isArray(s?.items) ? s.items.map((i: unknown) => clean(i, 220)).filter(Boolean).slice(0, 6) : [] }))
      .filter((s: PlanSection) => s.title && s.items.length).slice(0, 4)
    : [];
  return personPlan(sections.length ? { title: parsed.title, summary: clean(out?.summary, 280) || parsed.summary, sections } : fallback);
}

const clipIdea = (idea: string) => idea.replace(/\s+/g, ' ').trim().slice(0, 90);

/** A short note for the top of one part: what it means, plus one idea for this project. */
export async function explainStage(idea: string, stage: StageId): Promise<string> {
  const info = stageInfo(stage);
  const fallback = guideLine(stage, idea);
  const out = await gemini(`The person is a scientist who does not code. They asked for: "${idea}"
They are looking at the part called "${info.name}": ${info.real}.
Reply with JSON: {"text": string}
Exactly 2 sentences, max 55 words together. Sentence 1: what this part is. If you use a technical word, explain it in that same sentence. Sentence 2: one practical idea for THIS project. No file names and no code.`, 7000);
  return clean(out?.text, 420) || fallback;
}

function guideLine(stage: StageId, idea: string): string {
  const name = clipIdea(idea) || 'your idea';
  const lines: Record<StageId, string> = {
    plan: `This is the plan, before anything is built. Change any line that does not match the work you want. For “${name}”, keep only what you would actually use.`,
    setup: `This step only gets a folder ready. You will not see it in the app. Think of it as clearing a desk before you start “${name}”.`,
    look: `This is what you see and tap. People sometimes call it the “frontend”, which only means the visible side. For “${name}”, use labels a first-time visitor would understand.`,
    logic: `This is what happens when you use the app. People sometimes call the hidden part the “backend”, which only means the actions you cannot see. Each button in “${name}” should do one clear thing.`,
    memory: `This is what the app still knows tomorrow. A store of saved information is called a “database”. For “${name}”, keep only what you would want to look up later.`,
    check: `This step tries the important actions with example information. People call these automatic tries “tests”. One try for each important action in “${name}” is enough.`,
    done: `“${name}” is ready to open. You can still send a note to add something, change a label, or ask what a part means.`,
  };
  return lines[stage];
}

/** Deeper notes for quiet moments, when the builder is busy with a bigger piece and nothing new has happened. */
const DEEPER: Record<StageId, string[]> = {
  plan: [
    'While the builder thinks, here is why a plan comes first: it is much cheaper to change a sentence now than a finished screen later.',
    'A good plan names what you do, what you see, and what the app remembers. Those three parts become the districts on this site.',
  ],
  setup: [
    'The builder is still preparing. This part is like labeling the drawers before filling them, so every later piece knows where to go.',
    'Nothing here shows up in your app, but it tells any computer how to open and check your app later.',
  ],
  look: [
    'The builder is working on a bigger page right now. Pages only show things; when you tap, they hand the job to the actions.',
    'Good pages use short labels and one clear button per job. That is what makes an app feel easy the first time.',
  ],
  logic: [
    'This is the thinking part of the app, so it takes a little longer. Each action takes what you typed, decides what to do, and updates the page.',
    'Actions are written as small named steps, like add a reading or work out growth, so a later change only touches one step.',
  ],
  memory: [
    'The builder is making sure nothing is lost when you close the page. The actions hand information here, and it comes back next time you open the app.',
    'Saving well means choosing what to keep. Your app keeps only what you would want to look up again.',
  ],
  check: [
    'The builder is trying your app with made-up examples, like a test drive. If an answer comes out wrong, it fixes the part and tries again.',
    'These tries stay with your app, so any later change is checked the same way before you see it.',
  ],
  done: ['Your app is ready. You can open it, ask for a change, or ask what any part does.'],
};

/** A longer note for a quiet moment in one stage. `n` counts the notes already given in this stage. */
export async function explainPause(idea: string, stage: StageId, done: string[], parts: string[], n: number): Promise<string> {
  const pool = DEEPER[stage];
  const fallback = pool[n % pool.length];
  const info = stageInfo(stage);
  const out = await gemini(`The person asked for: "${idea}"
The builder is in the part called "${info.name}" (${info.real}) and has been quiet for a while because it is working on a bigger piece.
Finished so far: ${done.slice(-6).join('; ') || 'nothing yet'}
Parts of the app so far: ${parts.slice(-6).join(', ') || 'none yet'}
${n ? 'You already explained this part once, so explain a different side of it.' : ''}
Reply with JSON: {"text": string}
2 sentences, max 40 words together, spoken aloud by a calm guide. Explain what the builder is most likely working on now in THEIR app,
and how this part connects to the other parts. If you use a technical word, explain it in the same sentence. No file names, no code.`, 8000);
  return clean(out?.text, 320) || fallback;
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
  const out = await gemini(`Someone typed this into Vibeerr: "${text}"
${hasApp ? 'They already have an app built in Vibeerr.' : 'They have not built an app yet.'}
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
    'Your builder is reading your idea and writing a short plan you can change before anything is built.',
    'Nothing is built yet. The plan says what you can do, what you will see, and what the app keeps.',
  ],
  setup: [
    'Your builder is getting a folder ready. You will not see this part in the app.',
    'The workspace is being prepared, like clearing a desk before the real work.',
  ],
  look: [
    'Your builder is making the pages you will see and tap.',
    'The visible side is taking shape: headings, buttons, and colors. People call this the frontend, which only means what you see.',
  ],
  logic: [
    'Your builder is deciding what happens when you use each button.',
    'Each tap needs one clear result. The hidden actions are sometimes called the backend.',
  ],
  memory: [
    'Your builder is teaching the app what to keep for tomorrow.',
    'Saved information is going into a store. A larger store is called a database.',
  ],
  check: [
    'Your builder is trying the important actions with example information.',
    'These automatic tries are called tests. They make sure a later change does not quietly break something.',
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
        ? ['Gave your project a name and a folder', ...(/"test"/.test(code) ? ['Got ready to try the actions later'] : [])]
        : ['Got the folder ready'];
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
    [/^package\.json$/, 'Project card', 'Holds the app’s name and how to try it later. The builder reads it first.'],
    [/^index\.html?$/, 'Main page', 'The page you see first: the headings, boxes, and buttons. Your taps start here.'],
    [/\.(css|scss)$/, 'Colors and layout', 'Decides colors, sizes, and spacing, including on a phone.'],
    [/^(app|main|script|index)\.(js|ts|mjs)$/, 'Button actions', 'Decides what happens when you tap a button, then asks the saved information to update.'],
    [/(storage|store|db|database|data)/, 'Saved information', 'Keeps your information and brings it back next time, so closing the page does not lose it.'],
    [/(test|spec)/, 'Practice tries', 'Tries the actions with example information and flags a wrong answer.'],
    [/^readme/, 'Instructions', 'Explains what the app is and how to open it.'],
    [/^project_guide/, 'Developer guide', 'A map of the app for any developer who joins later.'],
  ];
  for (const [re, name, does] of known) if (re.test(base)) return { file, name, does };
  const words = humanName(file);
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  const does: Record<StageId, string> = {
    plan: 'Part of the plan.', setup: 'Part of getting the folder ready.', look: 'Part of what you see on the page.',
    logic: 'One of the actions behind the buttons.', memory: 'Helps the app keep your information.',
    check: 'A practice try that makes sure an action works.', done: 'Part of your app.',
  };
  return { file, name: name.slice(0, 32), does: does[stage] };
}
