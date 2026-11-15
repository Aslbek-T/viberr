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
 * The stages every project goes through. On screen the app is a building site:
 * each of the five middle stages is a district, and every part the builder makes is a block in it.
 * Names stay in everyday words. A technical term appears only inside the lesson, with its meaning.
 */
export const STAGES: StageInfo[] = [
  { id: 'plan', name: 'Idea', real: 'What you want the app to do', color: '#9fc3e8',
    lesson: 'This is the plan, before anything is built. It says what you can do, what you will see, and what the app keeps. Change the words until they match the work you actually want.' },
  { id: 'setup', name: 'Start', real: 'Getting a folder ready', color: '#c9b48a',
    lesson: 'This step only prepares a folder and the tools. You will not see it in the finished app. Think of it as clearing a desk before an experiment.' },
  { id: 'look', name: 'Pages', real: 'What you see and tap', color: '#73cfab',
    lesson: 'These are the pages, buttons, and colors. People sometimes call this the “frontend”, which only means the side you can see. Your taps start here.' },
  { id: 'logic', name: 'Actions', real: 'What happens when you use it', color: '#a89ae8',
    lesson: 'Each button needs one clear result, such as “Add puts this on the list”. People sometimes call the hidden part the “backend”. It is just the actions you cannot see.' },
  { id: 'memory', name: 'Saved', real: 'What is still there tomorrow', color: '#efbc6d',
    lesson: 'This is the information the app keeps after you close it. A larger store of information is called a “database”. The actions save into it and read it back.' },
  { id: 'check', name: 'Try out', real: 'Making sure it really works', color: '#e98f8f',
    lesson: 'The builder tries the important actions with example information. People call these automatic tries “tests”. They catch a break before you do.' },
  { id: 'done', name: 'Done', real: 'Ready for you to use', color: '#b9d897',
    lesson: 'You can open the app, send a note, or ask what any part means. A later change walks through the same parts again.' },
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
  sections?: PlanSection[];                   // the plan, in plain words
  editable?: boolean;                         // the person can change the lines before saying yes
  options: { label: string; explain: string }[];
  recommended?: number;
}

/** An AI the person already has on this computer. Vibeerr does not add a new account. */
export type AgentId = 'claude' | 'cursor' | 'codex';

export const AGENTS: { id: AgentId; label: string; blurb: string }[] = [
  { id: 'claude', label: 'Claude', blurb: 'Claude Code, already signed in on this computer' },
  { id: 'cursor', label: 'Cursor', blurb: 'The Cursor agent, already installed on this computer' },
  { id: 'codex', label: 'Codex', blurb: 'Codex, already installed on this computer' },
];

export const isAgentId = (v: unknown): v is AgentId => v === 'claude' || v === 'cursor' || v === 'codex';

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
  /** A short note from the guide for each part, written for this project. */
  guides: Partial<Record<StageId, string>>;
  /** Recommendations the person sent while the builder was working. */
  notes: string[];
  agent: AgentId;
  /** The folder this project lives in. */
  folder: string;
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
  | { type: 'problem'; text: string }
  | { type: 'guide'; stage: StageId; text: string }
  | { type: 'note'; text: string }
  | { type: 'agent'; agent: AgentId };

// Browser -> brain
export type ClientMsg = { type: 'answer'; id: string; option: number; plan?: PlanSection[]; summary?: string };

/**
 * Answer to POST /api/message. The brain decides what the person meant:
 * a question gets a plain answer right away, an app idea (or a change to the app) starts a build.
 */
export type MessageReply =
  | { ok: true; route: 'answer'; answer: string[] }
  | { ok: true; route: 'build' | 'change' | 'note' }
  | { ok: false; error: string };

/** One line of a recorded run (web/public/demo.jsonl). `t` is ms since the run started. */
export interface RecordedLine { t: number; msg: StoryMsg }
