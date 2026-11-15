import fs from 'node:fs';
import path from 'node:path';
import type { BuildEvent, Concept } from '../../shared/events.ts';
import { ROOT, SESSIONS_DIR } from './config.ts';

export const CONCEPTS: Concept[] = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'shared/concepts.json'), 'utf8'),
);

/** Which concept to teach for this event, if any. */
export function conceptFor(e: BuildEvent): Concept | undefined {
  if (e.kind === 'shell' && e.room === 'setup' && /install|add/.test(e.detail?.command ?? '')) {
    return CONCEPTS.find((c) => c.id === 'dependencies');
  }
  if (e.kind === 'shell' && e.room === 'setup') return CONCEPTS.find((c) => c.id === 'terminal');
  if (e.room === 'database' && /schema|model/i.test(e.detail?.file ?? '')) {
    return CONCEPTS.find((c) => c.id === 'schema');
  }
  if (e.room === 'screens' && /components?\//i.test(e.detail?.file ?? '')) {
    return CONCEPTS.find((c) => c.id === 'component');
  }
  return CONCEPTS.find((c) => c.room === e.room);
}

// --- Learned-concept memory. TODO(A9): swap the body for supermemory, keep the same functions. ---
const MEMORY_FILE = path.join(SESSIONS_DIR, 'memory.json');
type Memory = Record<string, string[]>;

function load(): Memory {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
}

export function learnedConcepts(userId: string): string[] {
  return load()[userId] ?? [];
}

export function markLearned(userId: string, conceptId: string): void {
  const m = load();
  const list = new Set(m[userId] ?? []);
  list.add(conceptId);
  m[userId] = [...list];
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2));
}
