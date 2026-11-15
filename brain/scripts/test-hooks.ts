// Sends fake Claude Code hook payloads through the REAL hook script, exactly like Claude Code would.
// Usage: npm start (in another terminal), open http://localhost:4321, then: npm run hooks:test
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../src/config.ts';

const script = path.join(ROOT, 'brain/hooks/claude-hook.sh');
const session_id = `hooks-test-${Date.now()}`;
const cwd = '/tmp/plant-demo';
const steps = [
  { hook_event_name: 'SessionStart', source: 'startup' },
  { hook_event_name: 'UserPromptSubmit', prompt: 'build a plant growth tracker' },
  { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${cwd}/package.json` } },
  { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: `${cwd}/db/schema.sql`, content: 'create table plants (...);' } },
  { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: `${cwd}/server/routes/plants.ts`, content: 'a\nb\nc' } },
  { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: `${cwd}/src/components/Chart.tsx`, content: 'x' } },
  { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } },
  { hook_event_name: 'Stop' },
];
for (const s of steps) {
  const out = execFileSync(script, { input: JSON.stringify({ session_id, cwd, ...s }) }).toString();
  console.log(`${s.hook_event_name} ${(s as any).tool_name ?? ''} -> ${out || '(no answer: is the brain running?)'}`);
  await new Promise((r) => setTimeout(r, 1200));
}
console.log('\nIf the building moved, hooks work. If Claude Code still shows nothing, run /hooks inside claude.');
