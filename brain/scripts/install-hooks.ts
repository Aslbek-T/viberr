// Usage: npm run hooks:install -- /path/to/your/project
// Adds Buildscape hooks to <project>/.claude/settings.json (keeps anything already there).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.ts';

const target = path.resolve(process.argv[2] ?? process.cwd());
const script = path.join(ROOT, 'brain/hooks/claude-hook.sh');
const file = path.join(target, '.claude/settings.json');

// Quoted so folders with spaces (e.g. "sun hacks/viberr") still work.
const quoted = JSON.stringify(script);
const cmd = { type: 'command', command: quoted, timeout: 90 };
const EVENTS: Record<string, boolean> = {
  SessionStart: false, UserPromptSubmit: false, PreToolUse: true, PostToolUse: true,
  Notification: false, Stop: false, SubagentStop: false,
};

let settings: any = {};
if (fs.existsSync(file)) settings = JSON.parse(fs.readFileSync(file, 'utf8'));
settings.hooks ??= {};
for (const [ev, needsMatcher] of Object.entries(EVENTS)) {
  const list: any[] = (settings.hooks[ev] ??= []);
  // Drop old unquoted entries from earlier installs, then add ours once.
  for (const g of list) if (g.hooks) g.hooks = g.hooks.filter((h: any) => h.command !== script);
  const already = list.some((g) => g.hooks?.some((h: any) => h.command === quoted));
  if (!already) list.push(needsMatcher ? { matcher: '*', hooks: [cmd] } : { hooks: [cmd] });
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(`Buildscape hooks installed in ${file}`);
console.log('Start the brain (npm start), open http://localhost:4321, then run `claude` in that project.');
console.log('Inside Claude Code, type /hooks to check they are listed. Already running claude? Restart it.');
console.log('Test without Claude: npm run hooks:test');
