// THE CONTRACT between brain/ and web/. Frozen at 9:15 PM.
// Adding an optional field is OK after a heads-up. Renaming or removing needs both people to agree.

export type AgentSource = 'claude-code' | 'cursor' | 'codex' | 'replay';
export type Room = 'lobby' | 'screens' | 'api' | 'database' | 'login' | 'tests' | 'setup';
export type EventKind =
  | 'session_start' | 'thinking' | 'file_read' | 'file_edit' | 'shell'
  | 'test_run' | 'waiting_for_user' | 'user_replied' | 'error' | 'done';

export const ROOMS: Room[] = ['lobby', 'screens', 'api', 'database', 'login', 'tests', 'setup'];

export interface BuildEvent {
  id: string;            // time-sortable id
  ts: number;            // ms epoch
  sessionId: string;
  source: AgentSource;
  agentId: string;       // one character per agent or subagent
  kind: EventKind;
  room: Room;
  summary: string;       // raw, e.g. "Edited src/api/users.ts (+24 lines)"
  detail?: {
    file?: string; command?: string; diffLines?: number;
    exitCode?: number; question?: string; options?: string[];
  };
}

export interface Narration { eventId: string; text: string; conceptId?: string; }

export interface Concept {
  id: string; room: Room; title: string; oneLiner: string;
  analogy: Record<ThemeId, string>;
}

export interface DecisionCard {
  id: string; eventId: string; question: string;
  options: { label: string; explain: string }[];
  recommended?: number;
}

export type ThemeId = 'office' | 'lab' | 'kitchen';
export type Level = 'new' | 'some' | 'dev';

export interface UserProfile {
  userId: string; field: string; level: Level;
  style: 'visual' | 'reading' | 'listening'; theme: ThemeId;
  a11y: {
    reducedMotion: boolean; colorSafe: boolean; dyslexiaFont: boolean;
    captions: boolean; voice: boolean; lang: 'en' | 'es' | 'uz' | string;
  };
}

// Server -> browser
export type ServerMsg =
  | { type: 'event'; data: BuildEvent }
  | { type: 'narration'; data: Narration }
  | { type: 'concept'; data: Concept & { seenBefore: boolean } }
  | { type: 'decision'; data: DecisionCard }
  | { type: 'status'; data: { mode: 'live' | 'replay'; sources: AgentSource[] } };

// Browser -> server
export type ClientMsg =
  | { type: 'profile'; data: UserProfile }
  | { type: 'decide'; cardId: string; option: number }
  | { type: 'replay'; file: string; speed: number }
  | { type: 'learned'; conceptId: string };

// Session file format (sessions/**/*.jsonl): one line per message sent to the browser.
// `t` is ms since the session started. Both the brain replayer and the web fixture mode read this.
export interface SessionLine { t: number; msg: ServerMsg; }
