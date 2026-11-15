// Writes hand-written demo sessions to sessions/fixtures/ using the real narrator and concept logic.
// Usage: npm run fixtures
import fs from 'node:fs';
import path from 'node:path';
import type { AgentSource, BuildEvent, DecisionCard, EventKind, Room, ServerMsg, SessionLine, UserProfile } from '../../shared/events.ts';
import { SESSIONS_DIR } from '../src/config.ts';
import { conceptFor } from '../src/concepts.ts';
import { DEFAULT_PROFILE } from '../src/hub.ts';
import { narrate } from '../src/narrator/index.ts';

type Step = {
  gap: number; source?: AgentSource; agent?: string; kind: EventKind; room: Room; summary: string;
  detail?: BuildEvent['detail']; card?: Omit<DecisionCard, 'id' | 'eventId'>;
};

async function build(name: string, profile: UserProfile, steps: Step[]) {
  const lines: SessionLine[] = [];
  const seen = new Set<string>();
  const sessionId = `fixture-${name}`;
  let t = 0;
  const push = (msg: ServerMsg, dt = 0) => { t += dt; lines.push({ t, msg }); };
  const sources = [...new Set(steps.map((s) => s.source ?? 'claude-code'))];
  push({ type: 'status', data: { mode: 'replay', sources } });

  for (const [i, s] of steps.entries()) {
    const source = s.source ?? 'claude-code';
    const e: BuildEvent = {
      id: `ev_${name}_${i}`, ts: 1763170000000 + t, sessionId, source,
      agentId: s.agent ?? (source === 'claude-code' ? 'claude' : source), kind: s.kind, room: s.room,
      summary: s.summary, detail: s.detail,
    };
    push({ type: 'event', data: e }, s.gap);
    const n = await narrate(e, profile);
    const c = conceptFor(e);
    if (c) n.conceptId = c.id;
    push({ type: 'narration', data: n }, 400);
    if (c && !seen.has(c.id) && e.kind !== 'waiting_for_user') {
      seen.add(c.id);
      push({ type: 'concept', data: { ...c, seenBefore: false } }, 600);
    }
    if (s.card) push({ type: 'decision', data: { id: `card_${name}_${i}`, eventId: e.id, ...s.card } }, 300);
  }
  const file = path.join(SESSIONS_DIR, 'fixtures', `${name}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  console.log(`wrote ${path.relative(SESSIONS_DIR, file)} (${lines.length} lines, ${(t / 1000).toFixed(0)} s)`);
}

const installCard = {
  question: 'Claude wants to install "better-sqlite3", code written by other people, to store your plant data. Allow it?',
  options: [
    { label: 'Allow', explain: 'Most apps use shared code like this. It downloads files into this project only.' },
    { label: 'Don’t allow', explain: 'Claude will try to save data another way, for example in a plain file.' },
  ],
  recommended: 0,
};

const lab: Step[] = [
  { gap: 500, kind: 'session_start', room: 'lobby', summary: 'Session started' },
  { gap: 1500, kind: 'thinking', room: 'lobby', summary: 'You asked: build me a web app to track how tall my plants grow each day' },
  { gap: 2500, kind: 'file_read', room: 'setup', summary: 'Read package.json', detail: { file: 'package.json' } },
  { gap: 2500, kind: 'thinking', room: 'lobby', summary: 'Plan: a page to log heights, a server to save them, a chart' },
  { gap: 3000, kind: 'waiting_for_user', room: 'setup', summary: installCard.question, detail: { command: 'npm install better-sqlite3', question: installCard.question, options: ['Allow', 'Don’t allow'] }, card: installCard },
  { gap: 1500, kind: 'user_replied', room: 'setup', summary: 'You allowed it' },
  { gap: 1500, kind: 'shell', room: 'setup', summary: '$ npm install better-sqlite3', detail: { command: 'npm install better-sqlite3' } },
  { gap: 3500, kind: 'file_edit', room: 'database', summary: 'Wrote db/schema.sql', detail: { file: 'db/schema.sql', diffLines: 14 } },
  { gap: 3000, kind: 'file_edit', room: 'database', summary: 'Wrote db/plants.ts', detail: { file: 'db/plants.ts', diffLines: 38 } },
  { gap: 3500, kind: 'file_edit', room: 'api', summary: 'Wrote server/routes/measurements.ts', detail: { file: 'server/routes/measurements.ts', diffLines: 52 } },
  { gap: 3500, kind: 'file_edit', room: 'screens', summary: 'Wrote src/components/GrowthChart.tsx', detail: { file: 'src/components/GrowthChart.tsx', diffLines: 61 } },
  { gap: 3000, kind: 'file_edit', room: 'screens', summary: 'Edited src/pages/index.tsx', detail: { file: 'src/pages/index.tsx', diffLines: 24 } },
  { gap: 3000, kind: 'file_edit', room: 'login', summary: 'Wrote server/auth/session.ts', detail: { file: 'server/auth/session.ts', diffLines: 30 } },
  { gap: 3500, kind: 'file_edit', room: 'tests', summary: 'Wrote tests/measurements.test.ts', detail: { file: 'tests/measurements.test.ts', diffLines: 33 } },
  { gap: 2500, kind: 'test_run', room: 'tests', summary: '$ npm test', detail: { command: 'npm test' } },
  { gap: 3000, kind: 'test_run', room: 'tests', summary: 'Command had problems: npm test', detail: { command: 'npm test', exitCode: 1 } },
  { gap: 3000, kind: 'file_edit', room: 'api', summary: 'Edited server/routes/measurements.ts', detail: { file: 'server/routes/measurements.ts', diffLines: 4 } },
  { gap: 2500, kind: 'test_run', room: 'tests', summary: '$ npm test', detail: { command: 'npm test', exitCode: 0 } },
  { gap: 3000, kind: 'done', room: 'lobby', summary: 'Finished this turn' },
];

const recipeCard = {
  question: 'Cursor wants to add a login so only your family can edit recipes. Add it now?',
  options: [
    { label: 'Yes, add login', explain: 'Takes a few more minutes. Strangers could view but not change recipes.' },
    { label: 'Not now', explain: 'Anyone with the link could edit. Fine while you are testing.' },
  ],
  recommended: 0,
};

const kitchen: Step[] = [
  { gap: 500, source: 'cursor', kind: 'session_start', room: 'lobby', summary: 'Session started' },
  { gap: 300, source: 'codex', kind: 'session_start', room: 'lobby', summary: 'Session started' },
  { gap: 1500, source: 'cursor', kind: 'thinking', room: 'lobby', summary: 'You asked: make a recipe box app for my family recipes' },
  { gap: 2500, source: 'codex', kind: 'shell', room: 'setup', summary: '$ npm install express', detail: { command: 'npm install express' } },
  { gap: 2500, source: 'cursor', kind: 'file_edit', room: 'screens', summary: 'Wrote src/components/RecipeCard.tsx', detail: { file: 'src/components/RecipeCard.tsx', diffLines: 48 } },
  { gap: 2500, source: 'codex', kind: 'file_edit', room: 'database', summary: 'Wrote db/models/recipe.ts', detail: { file: 'db/models/recipe.ts', diffLines: 27 } },
  { gap: 2500, source: 'codex', kind: 'file_edit', room: 'api', summary: 'Wrote server/routes/recipes.ts', detail: { file: 'server/routes/recipes.ts', diffLines: 44 } },
  { gap: 2500, source: 'cursor', kind: 'file_edit', room: 'screens', summary: 'Edited src/pages/index.tsx', detail: { file: 'src/pages/index.tsx', diffLines: 19 } },
  { gap: 3000, source: 'cursor', kind: 'waiting_for_user', room: 'login', summary: recipeCard.question, detail: { question: recipeCard.question, options: ['Yes, add login', 'Not now'] }, card: recipeCard },
  { gap: 1500, source: 'cursor', kind: 'user_replied', room: 'login', summary: 'You chose: Yes, add login' },
  { gap: 2500, source: 'cursor', kind: 'file_edit', room: 'login', summary: 'Wrote server/auth/login.ts', detail: { file: 'server/auth/login.ts', diffLines: 35 } },
  { gap: 2500, source: 'codex', kind: 'file_edit', room: 'tests', summary: 'Wrote tests/recipes.test.ts', detail: { file: 'tests/recipes.test.ts', diffLines: 29 } },
  { gap: 2500, source: 'codex', kind: 'test_run', room: 'tests', summary: '$ npx vitest run', detail: { command: 'npx vitest run', exitCode: 0 } },
  { gap: 2500, source: 'cursor', kind: 'done', room: 'lobby', summary: 'Finished this turn' },
  { gap: 500, source: 'codex', kind: 'done', room: 'lobby', summary: 'Finished this turn' },
];

const quick: Step[] = [
  { gap: 300, kind: 'session_start', room: 'lobby', summary: 'Session started' },
  { gap: 1000, kind: 'file_read', room: 'screens', summary: 'Read src/App.tsx', detail: { file: 'src/App.tsx' } },
  { gap: 1000, kind: 'file_edit', room: 'api', summary: 'Edited server/api/users.ts', detail: { file: 'server/api/users.ts', diffLines: 12 } },
  { gap: 1000, kind: 'waiting_for_user', room: 'setup', summary: installCard.question, detail: { question: installCard.question }, card: installCard },
  { gap: 1000, kind: 'test_run', room: 'tests', summary: '$ npm test', detail: { command: 'npm test', exitCode: 0 } },
  { gap: 1000, kind: 'done', room: 'lobby', summary: 'Finished this turn' },
];

const kitchenProfile: UserProfile = { ...DEFAULT_PROFILE, userId: 'demo-cook', field: 'Cooking', theme: 'kitchen' };
await build('lab-demo', DEFAULT_PROFILE, lab);
await build('kitchen-demo', kitchenProfile, kitchen);
await build('quick', DEFAULT_PROFILE, quick);
