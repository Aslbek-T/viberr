import { TEST_CMD, type Raw } from './stages.ts';

/** Non-interactive execution using the person's existing Codex login. */
export function codexArgs(dir: string, prompt: string): string[] {
  return ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'approval_policy="never"', '-C', dir, '--', prompt];
}

/** Raw Codex events stay in the brain; only the guide can turn them into browser messages. */
export function parseCodexLine(line: string): { steps: Raw[]; result?: { text: string; error: boolean } } {
  let event;
  try { event = JSON.parse(line); } catch { return { steps: [] }; }
  if (!event || typeof event !== 'object') return { steps: [] };
  if (event.type === 'turn.failed' || event.type === 'error') {
    return { steps: [], result: { text: String(event.error?.message ?? event.message ?? 'Codex stopped unexpectedly.'), error: true } };
  }
  const item = event.item;
  if (!item || typeof item !== 'object') return { steps: [] };
  if (item.type === 'command_execution') {
    const command = String(item.command ?? '').slice(0, 300);
    if (event.type === 'item.started') return { steps: [{ kind: 'run', command }] };
    if (event.type === 'item.completed') {
      if (item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)) {
        return { steps: [{ kind: 'problem', command, text: String(item.aggregated_output ?? '').slice(-600) }] };
      }
      if (item.exit_code === 0 && TEST_CMD.test(command)) return { steps: [{ kind: 'pass' }] };
    }
  }
  if (event.type === 'item.completed' && item.type === 'agent_message' && typeof item.text === 'string') {
    return { steps: [{ kind: 'note', text: item.text }], result: { text: item.text, error: false } };
  }
  // File writes are collected by the folder watcher, including writes made by shell commands.
  return { steps: [] };
}
