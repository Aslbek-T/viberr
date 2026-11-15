// Usage: npm run hooks:install -- /path/to/your/project
// Adds Buildscape hooks to <project>/.claude/settings.json (keeps anything already there).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.ts';

const target = path.resolve(process.argv[2] ?? process.cwd());
const script = path.join(ROOT, 'brain/hooks/claude-hook.sh');
const file = path.join(target, '.claude/settings.json');

const cmd = { type: 'command', command: script, timeout: 90 };
const EVENTS: Record<string, boolean> = {
  SessionStart: false, UserPromptSubmit: false, PreToolUse: true, PostToolUse: true,
  Notification: false, Stop: false, SubagentStop: false,
};

let settings: any = {};
if (fs.existsSync(file)) settings = JSON.parse(fs.readFileSync(file, 'utf8'));
settings.hooks ??= {};
for (const [ev, needsMatcher] of Object.entries(EVENTS)) {
  const list: any[] = (settings.hooks[ev] ??= []);
  const already = list.some((g) => g.hooks?.some((h: any) => h.command === script));
  if (!already) list.push(needsMatcher ? { matcher: '*', hooks: [cmd] } : { hooks: [cmd] });
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(`Buildscape hooks installed in ${file}`);
console.log('Start the brain (npm run dev), open the web app, then run `claude` in that project.');
