import type { BuildEvent, Narration, UserProfile } from '../../../shared/events.ts';
import { templateNarration } from './template.ts';

// Cache so replays and repeated steps cost nothing. Key includes level and theme.
const cache = new Map<string, string>();

export async function narrate(e: BuildEvent, p: UserProfile): Promise<Narration> {
  const mode = process.env.NARRATOR ?? 'template';
  // TODO(A3): haiku.ts and gemini.ts providers. Until then everything uses the template.
  void mode;
  const key = `${e.kind}|${e.room}|${p.level}|${p.theme}|${p.a11y.lang}|${e.summary}`;
  let text = cache.get(key);
  if (!text) {
    text = templateNarration(e, p);
    cache.set(key, text);
  }
  return { eventId: e.id, text };
}
