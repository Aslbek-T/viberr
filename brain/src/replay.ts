import fs from 'node:fs';
import path from 'node:path';
import type { SessionLine } from '../../shared/events.ts';
import { SESSIONS_DIR } from './config.ts';
import { hub } from './hub.ts';

/** Lists every recorded session under sessions/ (fixtures, golden, live). */
export function listSessions(): string[] {
  const out: string[] = [];
  for (const sub of ['golden', 'fixtures', 'live']) {
    const dir = path.join(SESSIONS_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) out.push(`${sub}/${f}`);
  }
  return out;
}

export function readSession(rel: string): SessionLine[] {
  const full = path.resolve(SESSIONS_DIR, rel);
  if (!full.startsWith(SESSIONS_DIR)) throw new Error('bad path');
  return fs.readFileSync(full, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

let token = 0;

/**
 * Streams a session to every browser exactly as it was recorded. The browser can't tell it from live.
 * Pauses on each decision card until someone answers (or 20 s pass), so demos feel interactive.
 */
export async function startReplay(rel: string, speed = 1) {
  const my = ++token;
  const lines = readSession(rel);
  hub.mode = 'replay';
  hub.sources = new Set(lines.flatMap((l) => (l.msg.type === 'event' ? [l.msg.data.source] : [])));
  hub.broadcast(hub.statusMsg(), false);
  console.log(`[replay] ${rel} at ${speed}x (${lines.length} messages)`);

  let prevT = 0;
  for (const line of lines) {
    if (my !== token) return; // a newer replay started
    const wait = Math.max(0, (line.t - prevT) / speed);
    prevT = line.t;
    await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
    if (my !== token) return;
    hub.broadcast(line.msg, false);
    if (line.msg.type === 'decision') {
      const cardId = line.msg.data.id;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 20000);
        hub.onDecide = (id) => { if (id === cardId) { clearTimeout(t); resolve(); } };
      });
      hub.onDecide = undefined;
    }
  }
  if (my === token) {
    hub.mode = 'live';
    hub.broadcast(hub.statusMsg(), false);
    console.log('[replay] finished');
  }
}

export function stopReplay() {
  token++;
  hub.mode = 'live';
  hub.broadcast(hub.statusMsg(), false);
}
