import type { StageId } from '../../shared/story.ts';

/** One raw thing the coding agent did. This never leaves the brain. */
export interface Raw {
  kind: 'prompt' | 'read' | 'write' | 'run' | 'pass' | 'think' | 'note' | 'problem';
  file?: string;      // path relative to the project
  command?: string;
  snippet?: string;   // what was written, so the translator can be specific
  text?: string;      // the agent's own words
}

const FILE_RULES: [RegExp, StageId][] = [
  [/(^|\/)plan\.md$/i, 'plan'],
  [/(^|\/)(__tests__|tests?|spec)(\/|\.|$)|\.(test|spec)\.[a-z]+$|(^|\/)tests?\.[a-z]+$/i, 'check'],
  [/(^|\/)(db|database|prisma|models?|migrations?|schema|storage|store|data)(\/|\.|$)|\.sql$/i, 'memory'],
  [/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|Dockerfile|\.gitignore|\.env[^/]*|tsconfig[^/]*\.json|[^/]*\.config\.[a-z]+)$/i, 'setup'],
  [/(^|\/)(components?|pages|views|styles?|public|ui)(\/|$)|\.(tsx|jsx|css|scss|html|vue|svelte)$/i, 'look'],
  [/(auth|login|session|api|routes?|server|controllers?|handlers?)/i, 'logic'],
  [/\.(js|mjs|cjs|ts|py|rb|go|rs|php|java)$/i, 'logic'],
];

export const TEST_CMD = /\b(jest|vitest|pytest|mocha|playwright|(npm|pnpm|yarn|bun) (run )?test|go test|cargo test)\b|\bnode\s+\S*tests?\S*/i;
const INSTALL_CMD = /\b(npm|pnpm|yarn|bun) (i|install|add|ci|init)\b|\bpip3? install\b|\bbrew install\b|\bnpx create-/i;

/** Which stage a raw step belongs to. `null` means "no opinion": it counts for whatever stage is active. */
export function stageOf(r: Raw): StageId | null {
  if (r.kind === 'write' && r.file) {
    for (const [re, stage] of FILE_RULES) if (re.test(r.file)) return stage;
    return null;
  }
  if (r.kind === 'pass') return 'check';
  if (r.kind === 'run' && r.command) {
    if (TEST_CMD.test(r.command)) return 'check';
    if (INSTALL_CMD.test(r.command)) return 'setup';
  }
  return null;
}

/** Commands a non-coder should be asked about before they run. */
export const RISKY_CMD = /\b(npm|pnpm|yarn|bun) (i|install|add)\b|\bpip3? install\b|\bbrew install\b|\brm\s+-[a-z]*r|\bgit push\b|\bcurl\b.*\|\s*(ba)?sh|\bsudo\b/;
export const isInstall = (c: string) => /\b(install|add|i)\b/.test(c) && !/\brm\b/.test(c);

/** "src/components/GrowthChart.tsx" -> "growth chart" */
export function humanName(file: string): string {
  const base = (file.split('/').pop() ?? file).replace(/\.[a-z0-9]+$/i, '').replace(/\.(test|spec)$/i, '');
  return base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.]+/g, ' ').trim().toLowerCase() || 'part';
}
