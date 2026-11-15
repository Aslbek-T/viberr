import type { BuildEvent, Level, UserProfile } from '../../../shared/events.ts';
import { ROOM_MEANING, ROOM_NAMES } from '../../../shared/themes.ts';

const AGENT_NAME: Record<BuildEvent['source'], string> = {
  'claude-code': 'Claude', cursor: 'Cursor', codex: 'Codex', replay: 'The agent',
};

function base(file?: string): string {
  return file ? file.split('/').pop() ?? file : 'a file';
}

/** Works with no network and no API key. Every other narrator falls back to this. */
export function templateNarration(e: BuildEvent, p: UserProfile): string {
  const who = AGENT_NAME[e.source];
  const place = ROOM_NAMES[p.theme][e.room];
  const meaning = ROOM_MEANING[e.room];
  const lvl: Level = p.level;
  const f = base(e.detail?.file);

  switch (e.kind) {
    case 'session_start':
      return `${who} just arrived and is getting ready to work.`;
    case 'thinking':
      return lvl === 'dev'
        ? `${who} is planning: ${e.summary}`
        : `${who} is at the ${place}, thinking about the plan before touching anything.`;
    case 'file_read':
      return lvl === 'dev'
        ? `Reading ${e.detail?.file ?? f}.`
        : `${who} is reading ${f} in the ${place} to understand how ${meaning} works right now.`;
    case 'file_edit': {
      const n = e.detail?.diffLines;
      const size = n ? (n > 40 ? 'a big change' : 'a small change') : 'a change';
      return lvl === 'dev'
        ? `Edited ${e.detail?.file ?? f}${n ? ` (${n} lines)` : ''}.`
        : `${who} made ${size} in the ${place}. This part of the app is about ${meaning}.`;
    }
    case 'shell':
      return lvl === 'dev'
        ? `Running \`${e.detail?.command ?? ''}\`.`
        : `${who} is typing a command to use a tool. It's like pressing a button on a lab instrument.`;
    case 'test_run':
      if (e.detail?.exitCode && e.detail.exitCode !== 0) {
        return `Some checks failed. That's normal: ${who} will read the results and fix the problem.`;
      }
      return `${who} is running the tests: automatic checks that the app still does what it should.`;
    case 'waiting_for_user':
      return `${who} needs you. ${e.detail?.question ?? 'Please take a look.'}`;
    case 'user_replied':
      return `Got your answer. ${who} is back to work.`;
    case 'error':
      return `Something went wrong in the ${place}. ${who} will look at the error and try another way.`;
    case 'done':
      return `${who} finished this step and is waiting for your next request.`;
  }
}
