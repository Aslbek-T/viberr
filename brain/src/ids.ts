let last = 0;
let seq = 0;
/** Time-sortable unique id (good enough for a hackathon, no dependency). */
export function newId(prefix = ''): string {
  const now = Date.now();
  seq = now === last ? seq + 1 : 0;
  last = now;
  return prefix + now.toString(36) + seq.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
}
