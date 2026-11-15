// The contract between brain/ and web/.
// The brain watches Claude Code, a translator turns the raw steps into friendly words,
// and the browser only ever receives these messages. No code, file names or commands reach the user.

export type StageId = 'plan' | 'setup' | 'look' | 'logic' | 'memory' | 'check' | 'done';

export interface StageInfo {
  id: StageId;
  house: string;   // name in the house theme
  real: string;    // what it really is, in plain words
  lesson: string;  // the one thing to learn in this stage
}

/** The stages every vibe-coded project goes through, shown as building a house. */
export const STAGES: StageInfo[] = [
  { id: 'plan', house: 'Blueprint', real: 'Understanding your idea and planning it',
    lesson: 'Every app starts as a plan: a short list of what it should let people do. A clear plan is the difference between a house and a pile of bricks.' },
  { id: 'setup', house: 'Foundation', real: 'Setting up the project and its tools',
    lesson: 'Before any building, the project needs a home and a toolbox. Developers call this "setup". Often they also bring in ready-made parts that other people already built.' },
  { id: 'look', house: 'Walls and windows', real: 'The screens people see and touch',
    lesson: 'This is the part of an app you can see: pages, buttons and colors. Developers call it the "frontend". It is the walls and windows of the house.' },
  { id: 'logic', house: 'Wiring', real: 'The rules that make the app do things',
    lesson: 'Behind every button there are rules: "when someone taps this, do that". Developers call this the "logic" or the "backend". Like wiring, you never see it, but nothing works without it.' },
  { id: 'memory', house: 'Storage room', real: 'Saving information so it is still there tomorrow',
    lesson: 'Apps need to remember things, like your list or your settings. The place where information is kept is called a "database". It is the storage room of the house.' },
  { id: 'check', house: 'Inspection', real: 'Checking that everything really works',
    lesson: 'Good builders check their own work. Developers write "tests": small automatic checks that run again after every change, so a new fix never breaks an old room.' },
  { id: 'done', house: 'Move-in day', real: 'Your app is ready to use',
    lesson: 'An app is never truly finished. You can always come back and ask for a change, and the builder will go through the same stages again, only faster.' },
];

export const stageInfo = (id: StageId) => STAGES.find((s) => s.id === id)!;

export interface Task { id: string; stage: StageId; text: string }

export interface Ask {
  id: string;
  question: string;
  details?: string[];                         // e.g. the plan, as friendly bullets
  options: { label: string; explain: string }[];
  recommended?: number;
}

export interface Finished { ok: boolean; summary: string; previewUrl?: string }

/** Everything the browser needs to draw the screen. Sent whole when a browser connects. */
export interface RunState {
  idea: string | null;
  running: boolean;
  stage: StageId;
  visited: StageId[];
  tasks: Task[];
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
  | { type: 'ask'; data: Ask }
  | { type: 'answered'; id: string; option: number | null }
  | { type: 'finished'; data: Finished }
  | { type: 'problem'; text: string };

// Browser -> brain
export type ClientMsg = { type: 'answer'; id: string; option: number };

/** One line of a recorded run (web/public/demo.jsonl). `t` is ms since the run started. */
export interface RecordedLine { t: number; msg: StoryMsg }
