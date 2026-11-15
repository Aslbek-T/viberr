import type { BuildEvent, Room } from '../../shared/events.ts';
import { ROOMS } from '../../shared/events.ts';

export interface RoomStats { files: string[]; edits: number; steps: number }

const empty = (): Record<Room, RoomStats> =>
  Object.fromEntries(ROOMS.map((r) => [r, { files: [], edits: 0, steps: 0 }])) as unknown as Record<Room, RoomStats>;

/** What has been built so far in this session, per room. Feeds the room meters and the summary map. */
class SessionStats {
  rooms = empty();
  agents = new Set<BuildEvent['source']>();

  record(e: BuildEvent) {
    const r = this.rooms[e.room];
    r.steps++;
    this.agents.add(e.source);
    if (e.kind !== 'file_edit') return;
    r.edits++;
    const f = e.detail?.file;
    if (f && !r.files.includes(f)) r.files.push(f);
  }

  get totalFiles() { return ROOMS.reduce((n, r) => n + this.rooms[r].files.length, 0); }

  reset() { this.rooms = empty(); this.agents.clear(); }
}

export const stats = new SessionStats();

export function baseName(file: string): string { return file.split('/').pop() || file; }
