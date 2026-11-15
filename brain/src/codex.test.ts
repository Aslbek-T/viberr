import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexArgs, parseCodexLine } from './codex.ts';

const parse = (event: unknown) => parseCodexLine(JSON.stringify(event));

test('execution keeps the sandbox, emits JSON, and treats the prompt as data', () => {
  const args = codexArgs('/tmp/my app', '--help');
  assert.deepEqual(args, ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'approval_policy="never"', '-C', '/tmp/my app', '--', '--help']);
});

test('command starts and completed checks produce distinct progress steps', () => {
  const item = { type: 'command_execution', command: 'node tests.js', exit_code: 0 };
  assert.deepEqual(parse({ type: 'item.started', item }).steps, [{ kind: 'run', command: 'node tests.js' }]);
  assert.deepEqual(parse({ type: 'item.completed', item }).steps, [{ kind: 'pass' }]);
  assert.deepEqual(parse({ type: 'item.updated', item }).steps, []);
});

test('failed checks report a problem rather than a pass', () => {
  assert.deepEqual(parse({ type: 'item.completed', item: {
    type: 'command_execution', command: 'npm test', exit_code: 1, aggregated_output: 'Expected two saved entries',
  } }).steps, [{ kind: 'problem', command: 'npm test', text: 'Expected two saved entries' }]);
});

test('final messages and fatal failures are captured for the finish summary', () => {
  assert.deepEqual(parse({ type: 'item.completed', item: { type: 'agent_message', text: 'Your app is ready.' } }).result,
    { text: 'Your app is ready.', error: false });
  assert.deepEqual(parse({ type: 'turn.failed', error: { message: 'Please sign in' } }).result,
    { text: 'Please sign in', error: true });
  assert.equal(parse({ type: 'error', message: 'Disconnected' }).result?.error, true);
});

test('ignores malformed, unknown and file events handled by the folder watcher', () => {
  for (const line of ['not json', 'null', '42', JSON.stringify({ type: 'thread.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: 'index.html' }] } })]) {
    assert.deepEqual(parseCodexLine(line), { steps: [] });
  }
});
