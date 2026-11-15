import fs from 'node:fs';
import path from 'node:path';
import type { AgentId, PlanSection } from '../../shared/story.ts';

// VIBEERR.md lives in the project folder. It is rewritten on every real change so Claude, Cursor,
// and Codex can take turns without starting over. The person never has to open it.

export interface Brief {
  idea: string;
  folder: string;
  agent: AgentId;
  plan?: string;
  planApproved?: boolean;
  tasks: string[];
  parts: { name: string; does: string }[];
  notes: string[];
}

const SKIP = /(^|\/)(node_modules|\.git|\.claude)(\/|$)/;

function filesIn(dir: string, rel = '', out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP.test(next) || entry.name === 'VIBEERR.md') continue;
    if (entry.isDirectory()) filesIn(dir, next, out);
    else if (out.length < 40) out.push(next);
  }
  return out;
}

export function planMarkdown(title: string, summary: string, sections: PlanSection[]) {
  const lines = [`# ${title || 'Your app'}`, '', summary.trim(), ''];
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function writeBrief(dir: string, brief: Brief) {
  const files = filesIn(dir);
  const lines = [
    '# Project brief',
    '',
    'Vibeerr keeps this file up to date so a different AI can continue the same project.',
    'Read it before you change anything. Do not delete it, and do not start the project over.',
    '',
    '## What the person wants',
    '',
    brief.idea.trim() || '(not set)',
    '',
    '## Folder',
    '',
    brief.folder,
    '',
    '## Builder currently in use',
    '',
    brief.agent,
    '',
    '## Plan',
    '',
    brief.planApproved ? 'The person approved this plan. Follow it.' : 'Not approved yet. If you were asked to plan, write PLAN.md and stop.',
    '',
    brief.plan?.trim() || '(none yet)',
    '',
    '## What is already done',
    '',
    ...(brief.tasks.length ? brief.tasks.map((task) => `- ${task}`) : ['- Nothing finished yet.']),
    '',
    '## Parts of the app',
    '',
    ...(brief.parts.length ? brief.parts.map((part) => `- ${part.name}: ${part.does}`) : ['- No parts yet.']),
    '',
    '## Notes from the person',
    '',
    ...(brief.notes.length ? brief.notes.map((note) => `- ${note}`) : ['- None yet.']),
    '',
    '## Files already in the folder',
    '',
    ...(files.length ? files.map((file) => `- ${file}`) : ['- None yet.']),
    '',
    '## Please continue',
    '',
    'Follow the approved plan and the notes above. If a note disagrees with the plan, follow the note.',
    '',
  ];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'VIBEERR.md'), lines.join('\n'));
}

const FILE_ROLE: Record<string, string> = {
  'index.html': 'The page a person opens.',
  'styles.css': 'How that page looks.',
  'app.js': 'What happens when someone uses the page.',
  'storage.js': 'What is still there after the page is closed.',
  'tests.js': 'Checks that the actions still work. Run them with `node tests.js`.',
  'package.json': 'The project name and the command that runs the checks.',
  'PLAN.md': 'The plan the person approved.',
};

/** Makes sure a developer can open a guide after the first build and after later changes. */
export function ensureGuide(dir: string, brief: Brief) {
  const file = path.join(dir, 'PROJECT_GUIDE.md');
  const files = filesIn(dir).filter((name) => name !== 'PROJECT_GUIDE.md');
  const latest = [
    '## Latest change',
    '',
    brief.idea.trim() || '(not set)',
    '',
    'Files now:',
    '',
    ...(files.length ? files.map((name) => `- \`${name}\``) : ['- None yet.']),
    '',
  ].join('\n');
  let current = '';
  try { current = fs.readFileSync(file, 'utf8'); } catch { /* write a full guide below */ }
  if (current.trim()) {
    const next = current.includes('## Latest change')
      ? current.replace(/## Latest change[\s\S]*$/, latest)
      : `${current.trim()}\n\n${latest}`;
    fs.writeFileSync(file, next.endsWith('\n') ? next : `${next}\n`);
    return;
  }
  const lines = [
    '# Developer guide',
    '',
    `This app was made in Vibeerr. The person asked for: ${brief.idea.trim() || '(not set)'}`,
    '',
    '## How to open it',
    '',
    'Open `index.html` in a browser. The checks, when they exist, run with `node tests.js`.',
    '',
    '## What it does',
    '',
    brief.plan?.trim() || brief.idea.trim() || '(not set)',
    '',
    '## Parts',
    '',
    ...(brief.parts.length ? brief.parts.map((part) => `- **${part.name}.** ${part.does}`) : ['- No parts were named yet.']),
    '',
    '## Files',
    '',
    ...(files.length ? files.map((name) => `- \`${name}\`: ${FILE_ROLE[name] ?? 'Part of this app.'}`) : ['- None yet.']),
    '',
    latest,
  ];
  fs.writeFileSync(file, `${lines.join('\n').trim()}\n`);
}
