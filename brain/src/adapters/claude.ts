import fs from 'node:fs';
import path from 'node:path';
import type { BuildEvent } from '../../../shared/events.ts';
import { NO_WAIT, SESSIONS_DIR } from '../config.ts';
import { hub } from '../hub.ts';
import { newId } from '../ids.ts';
import { isTestCommand, roomForCommand, roomForFile } from '../rooms.ts';

/**
 * Claude Code hook payload (stdin JSON). Field names come from real payloads; every raw payload is
 * also logged to sessions/raw/claude.jsonl so the mapping can be fixed from real samples.
 */
interface ClaudeHook {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_response?: any;
  prompt?: string;
  message?: string;
  source?: string;
}

// Bash commands worth asking a non-coder about before they run.
const RISKY = /\b(npm|pnpm|yarn|bun) (i|install|add)\b|\bpip3? install\b|\bbrew install\b|\brm -rf?\b|\bgit push\b|\bcurl\b.*\|\s*(ba)?sh/;

function logRaw(p: unknown) {
  const dir = path.join(SESSIONS_DIR, 'raw');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'claude.jsonl'), JSON.stringify(p) + '\n');
}

function rel(file: string | undefined, cwd?: string) {
  if (!file) return undefined;
  return cwd && file.startsWith(cwd) ? file.slice(cwd.length).replace(/^\//, '') : file;
}

function countLines(input: Record<string, any> = {}): number | undefined {
  const s = input.content ?? input.new_string ?? (Array.isArray(input.edits) ? input.edits.map((e: any) => e.new_string).join('\n') : undefined);
  return typeof s === 'string' ? s.split('\n').length : undefined;
}

function toEvent(p: ClaudeHook): BuildEvent | null {
  const base = { id: newId('ev_'), ts: Date.now(), sessionId: p.session_id, source: 'claude-code' as const, agentId: 'claude' };
  const input = p.tool_input ?? {};
  const file = rel(input.file_path ?? input.notebook_path ?? input.path, p.cwd);

  switch (p.hook_event_name) {
    case 'SessionStart':
      return { ...base, kind: 'session_start', room: 'lobby', summary: 'Session started' };
    case 'UserPromptSubmit':
      return { ...base, kind: 'thinking', room: 'lobby', summary: `You asked: ${(p.prompt ?? '').slice(0, 140)}` };
    case 'Notification':
      return { ...base, kind: 'waiting_for_user', room: 'lobby', summary: p.message ?? 'Claude needs your input',
        detail: { question: p.message ?? 'Claude is waiting for you in the terminal.' } };
    case 'Stop':
      return { ...base, kind: 'done', room: 'lobby', summary: 'Finished this turn' };
    case 'SubagentStop':
      return { ...base, agentId: 'claude-helper', kind: 'done', room: 'lobby', summary: 'Helper finished' };
    case 'PreToolUse': {
      switch (p.tool_name) {
        case 'Read': case 'Glob': case 'Grep': case 'LS':
          return { ...base, kind: 'file_read', room: roomForFile(file), summary: `${p.tool_name} ${file ?? input.pattern ?? ''}`.trim(), detail: { file } };
        case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit':
          return { ...base, kind: 'file_edit', room: roomForFile(file), summary: `${p.tool_name === 'Write' ? 'Wrote' : 'Edited'} ${file}`, detail: { file, diffLines: countLines(input) } };
        case 'Bash': {
          const command = String(input.command ?? '');
          return { ...base, kind: isTestCommand(command) ? 'test_run' : 'shell', room: roomForCommand(command), summary: `$ ${command.slice(0, 120)}`, detail: { command } };
        }
        case 'Task':
          return { ...base, kind: 'thinking', room: 'lobby', summary: `Sending a helper: ${input.description ?? ''}` };
        case 'TodoWrite':
          return { ...base, kind: 'thinking', room: 'lobby', summary: 'Updated the to-do list' };
        case 'WebFetch': case 'WebSearch':
          return { ...base, kind: 'file_read', room: 'lobby', summary: `Looking things up: ${input.query ?? input.url ?? ''}` };
        default:
          return { ...base, kind: 'thinking', room: 'lobby', summary: `Using ${p.tool_name}` };
      }
    }
    case 'PostToolUse': {
      if (p.tool_name !== 'Bash') return null;
      const r = p.tool_response ?? {};
      const failed = r.interrupted || (typeof r.exitCode === 'number' && r.exitCode !== 0) || /error|failed|FAIL/.test(String(r.stderr ?? ''));
      if (!failed) return null;
      const command = String(p.tool_input?.command ?? '');
      return { ...base, kind: isTestCommand(command) ? 'test_run' : 'error', room: roomForCommand(command), summary: `Command had problems: ${command.slice(0, 80)}`, detail: { command, exitCode: r.exitCode ?? 1 } };
    }
  }
  return null;
}

/** Explain a risky command in plain words for the decision card. */
function describe(command: string) {
  const pkg = command.match(/(?:install|add|i)\s+([^\s&|;]+)/)?.[1];
  if (/install|add\b/.test(command)) {
    return {
      question: pkg ? `Claude wants to install "${pkg}", code written by other people. Allow it?` : 'Claude wants to install the project’s dependencies. Allow it?',
      options: [
        { label: 'Allow', explain: 'Most apps use shared code like this. It downloads files into this project only.' },
        { label: 'Don’t allow', explain: 'Claude will try to do it without this package, or ask you why.' },
      ],
      recommended: 0,
    };
  }
  if (/rm -rf?/.test(command)) {
    return {
      question: 'Claude wants to delete files. Allow it?',
      options: [
        { label: 'Allow', explain: `It will run: ${command.slice(0, 80)}` },
        { label: 'Don’t allow', explain: 'Deleting can’t be undone. Choose this if you are unsure.' },
      ],
      recommended: 1,
    };
  }
  return {
    question: `Claude wants to run a command that changes things outside this folder. Allow it?`,
    options: [
      { label: 'Allow', explain: `It will run: ${command.slice(0, 80)}` },
      { label: 'Don’t allow', explain: 'Claude will stop and explain what it wanted to do.' },
    ],
    recommended: 1,
  };
}

/** Returns the JSON body the hook script prints to stdout for Claude Code. */
export async function handleClaudeHook(p: ClaudeHook): Promise<object> {
  logRaw(p);
  const e = toEvent(p);
  if (e) await hub.emit(e);

  if (p.hook_event_name === 'PreToolUse' && p.tool_name === 'Bash' && !NO_WAIT && hub.clients.size > 0) {
    const command = String(p.tool_input?.command ?? '');
    if (RISKY.test(command)) {
      const d = describe(command);
      const waitEv: BuildEvent = { ...(e as BuildEvent), id: newId('ev_'), kind: 'waiting_for_user', summary: d.question, detail: { command, question: d.question, options: d.options.map((o) => o.label) } };
      await hub.emit(waitEv);
      const choice = await hub.ask({ eventId: waitEv.id, ...d });
      if (choice === null) {
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'No answer in Buildscape; asking in the terminal.' } };
      }
      await hub.emit({ ...waitEv, id: newId('ev_'), ts: Date.now(), kind: 'user_replied', summary: choice === 0 ? 'You allowed it' : 'You said no' });
      return choice === 0
        ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Approved in Buildscape' } }
        : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'The user declined this in Buildscape. Explain in plain words what you wanted to do and suggest an alternative.' } };
    }
  }
  return {};
}
