import { spawn } from 'node:child_process';
import os from 'node:os';
import type { AgentId, MessageReply } from '../../shared/story.ts';
import { CLAUDE_BIN, CLAUDE_MODEL } from './config.ts';
import { runner } from './runner.ts';
import { story } from './story.ts';
import { answerWithGemini, routeWithGemini } from './translator.ts';

// Everything the person types goes through here first, like the chat box of Claude Code, Codex or Cursor:
// a question gets a plain answer right away; an app idea (or a change to the app) starts a build.

const TEACHER = `You are the friendly teacher inside Vibeerr, an app for people who have never coded.
Answer the question in plain words, like a patient teacher. You may use a real technical term, but explain it
in the same sentence, and use a small everyday comparison when it helps. 2 to 5 short paragraphs, no code,
no markdown headings, no lists longer than 4 items. Do not offer to build anything.`;

const BUILD_WORDS = /\b(build|make|create|design|develop|code|write|generate|i want|i need|i'd like|give me)\b/i;
const THING_WORDS = /\b(app|apps|website|site|page|game|tool|tracker|calculator|planner|list|chart|dashboard|bot|timer|quiz|journal|log|organizer|counter|board|store|shop)\b/i;
const QUESTION_START = /^(what|why|how|is|are|can|could|should|does|do|which|who|when|where|explain|tell me|teach me|difference|whats|what's)\b/i;
const CHANGE_WORDS = /\b(add|remove|change|make it|make the|bigger|smaller|color|colour|dark|fix|rename|instead|also|move|delete|update)\b/i;

/** Rules of thumb for when no guide model is available. */
export function guessRoute(text: string, hasApp: boolean): 'question' | 'build' | 'change' {
  const t = text.trim();
  const asksForThing = BUILD_WORDS.test(t) && THING_WORDS.test(t) && !/\bhow (do|can|would|should) (i|you|we|people)\b/i.test(t);
  if (asksForThing && !/^(what|why|is|are|which|who)\b/i.test(t)) return 'build';
  if (QUESTION_START.test(t) || /\?\s*$/.test(t)) return 'question';
  if (hasApp && CHANGE_WORDS.test(t)) return 'change';
  if (/^(an?|my|the)\s/i.test(t) || THING_WORDS.test(t)) return 'build';
  return hasApp ? 'change' : 'build';
}

function askClaude(question: string, context: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const args = ['-p', context ? `I am working on this app: ${context}\n\nMy question: ${question}` : question,
      '--output-format', 'json', '--append-system-prompt', TEACHER, '--tools', ''];
    if (CLAUDE_MODEL) args.push('--model', CLAUDE_MODEL);
    let out = '';
    let child;
    try { child = spawn(CLAUDE_BIN, args, { cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'ignore'] }); } catch { resolve(null); return; }
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(null); }, 90_000);
    child.stdout?.on('data', (d) => { out += String(d); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const text = String(JSON.parse(out).result ?? '').replace(/[*_#`]/g, '').trim();
        resolve(text ? text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6) : null);
      } catch { resolve(null); }
    });
  });
}

export async function handleMessage(text: string, opts?: { folder?: string; agent?: AgentId }): Promise<MessageReply> {
  if (story.state.running) {
    console.log(`[message] note: ${text.slice(0, 80)}`);
    const noted = runner.addNote(text);
    return noted.ok ? { ok: true, route: 'note' } : { ok: false, error: noted.error ?? 'That note could not be sent.' };
  }
  const hasApp = !!runner.run && !!story.state.finished?.ok;
  const route = (await routeWithGemini(text, hasApp)) ?? guessRoute(text, hasApp);
  console.log(`[message] ${route}: ${text.slice(0, 80)}`);
  if (route === 'question') {
    const context = hasApp ? story.state.idea ?? '' : '';
    const answer = (await answerWithGemini(text, context)) ?? (await askClaude(text, context));
    return answer ? { ok: true, route: 'answer', answer }
      : { ok: false, error: 'The teacher could not answer just now. Check that Claude Code works in a terminal, or add a Gemini key.' };
  }
  const started = await runner.start(text, { change: route === 'change', folder: opts?.folder, agent: opts?.agent ?? (route === 'change' ? runner.run?.agent : undefined) });
  return started.ok ? { ok: true, route } : { ok: false, error: started.error ?? 'The builder could not start.' };
}
