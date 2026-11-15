// The contract between brain/ and web/.
// The brain watches Claude Code, a guide turns the raw steps into friendly words,
// and the browser only ever receives these messages. No code, file names or commands reach the user
// (the one exception is the developer handoff page, which the person opens on purpose).

export type StageId = 'plan' | 'setup' | 'look' | 'logic' | 'memory' | 'check' | 'done';

export interface StageInfo {
  id: StageId;
  name: string;    // short name on the building site
  real: string;    // what it really is, in plain words
  lesson: string;  // the one thing to learn in this stage
  color: string;   // the color of this district's blocks
}

/**
 * The stages every vibe-coded project goes through. On screen the app is a building site:
 * each of the five middle stages is a district, and every part the builder makes is a block in it.
 */
export const STAGES: StageInfo[] = [
  { id: 'plan', name: 'Plan', real: 'Understanding your idea and planning it', color: '#9fc3e8',
    lesson: 'Every app starts as a plan: what people can do, which screens they see, and what it must remember. A clear plan is what AI builders like Claude Code, Codex and Cursor write first too.' },
  { id: 'setup', name: 'Toolbox', real: 'Setting up the project and its tools', color: '#c9b48a',
    lesson: 'Before building, a project gets a name, a folder and a toolbox. Developers call this "setup". It often lists ready-made parts other people already built.' },
  { id: 'look', name: 'Screens', real: 'What people see and touch', color: '#73cfab',
    lesson: 'The pages, buttons and colors you can see are called the "frontend". It only shows things and passes your taps on to the rules.' },
  { id: 'logic', name: 'Rules', real: 'What happens when you tap something', color: '#a89ae8',
    lesson: 'Behind every button is a rule: "when someone taps Add, put the item on the list". Developers call this the "logic" (on a server it is the "backend").' },
  { id: 'memory', name: 'Memory', real: 'Saving information so it is still there tomorrow', color: '#efbc6d',
    lesson: 'Apps keep information in a store so it survives closing the page. A bigger app uses a "database" for this. The rules save into it and load from it.' },
  { id: 'check', name: 'Checks', real: 'Making sure everything really works', color: '#e98f8f',
    lesson: 'Small automatic checks, called "tests", try the rules again after every change, so a new fix never quietly breaks something old.' },
  { id: 'done', name: 'Ready', real: 'Your app is ready to use', color: '#b9d897',
    lesson: 'An app is never truly finished. Ask for a change any time and the builder goes through the same districts again, only faster.' },
];

export const stageInfo = (id: StageId) => STAGES.find((s) => s.id === id)!;

export interface Task { id: string; stage: StageId; text: string }

/** One part of the app, drawn as a block in its district. `level` grows each time the builder improves it. */
export interface Block { id: string; stage: StageId; name: string; does: string; level: number }

export interface PlanSection { title: string; items: string[] }

export interface Ask {
  id: string;
  question: string;
  summary?: string;                           // one sentence above the details
  details?: string[];                         // short friendly bullets
  sections?: PlanSection[];                   // the full plan, in plain words
  options: { label: string; explain: string }[];
  recommended?: number;
}

export interface Finished {
  ok: boolean;
  summary: string;
  previewUrl?: string;
  /** How the app is put together, in plain words: one entry per district that has blocks. */
  structure?: { stage: StageId; parts: { name: string; does: string }[] }[];
  /** The developer handoff written by the builder, for someone who joins the project later. */
  handoffUrl?: string;
}

/** Everything the browser needs to draw the screen. Sent whole when a browser connects. */
export interface RunState {
  idea: string | null;
  running: boolean;
  stage: StageId;
  visited: StageId[];
  tasks: Task[];
  blocks: Block[];
  now: string;
  ask: Ask | null;
  finished: Finished | null;
  narrator: 'gemini' | 'template';
}

// Brain -> browser
export type StoryMsg =
  | { type: 'state'; data: RunState }
  | { type: 'stage'; stage: StageId }
  | { type: 'now'; stage: StageId; text: string }
  | { type: 'task'; data: Task }
  | { type: 'block'; data: Block }
  | { type: 'ask'; data: Ask }
  | { type: 'answered'; id: string; option: number | null }
  | { type: 'finished'; data: Finished }
  | { type: 'problem'; text: string };

// Browser -> brain
export type ClientMsg = { type: 'answer'; id: string; option: number };

/**
 * Answer to POST /api/message. The brain decides what the person meant:
 * a question gets a plain answer right away, an app idea (or a change to the app) starts a build.
 */
export type MessageReply =
  | { ok: true; route: 'answer'; answer: string[] }
  | { ok: true; route: 'build' | 'change' }
  | { ok: false; error: string };

/** One line of a recorded run (web/public/demo.jsonl). `t` is ms since the run started. */
export interface RecordedLine { t: number; msg: StoryMsg }
