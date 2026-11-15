import type { Room } from '../../shared/events.ts';

const FILE_RULES: [RegExp, Room][] = [
  [/(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[a-z]+$/i, 'tests'],
  [/(auth|login|logout|signup|session|jwt|password|oauth)/i, 'login'],
  [/(^|\/)(db|database|prisma|models?|migrations?|schema)(\/|\.|$)|\.sql$/i, 'database'],
  [/(^|\/)(api|routes?|server|controllers?|endpoints?|handlers?)(\/|\.|$)/i, 'api'],
  [/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|Dockerfile|\.env[^/]*|tsconfig[^/]*\.json|vite\.config\.[a-z]+|[^/]*\.config\.[a-z]+)$/i, 'setup'],
  [/(^|\/)(components?|pages|app|views|styles?|public|ui)(\/|$)|\.(tsx|jsx|css|scss|html|vue|svelte)$/i, 'screens'],
];

const COMMAND_RULES: [RegExp, Room][] = [
  [/\b(jest|vitest|pytest|mocha|playwright|npm (run )?test|pnpm test|yarn test|go test|cargo test)\b/i, 'tests'],
  [/\b(npm|pnpm|yarn|bun) (i|install|add|ci)\b|\bpip3? install\b|\bbrew install\b|\buv (add|pip)\b/i, 'setup'],
  [/\b(prisma|psql|sqlite3|mongosh|migrate)\b/i, 'database'],
  [/\bcurl\b|\bhttpie\b|\bhttp :/i, 'api'],
];

export function roomForFile(file?: string): Room {
  if (!file) return 'lobby';
  for (const [re, room] of FILE_RULES) if (re.test(file)) return room;
  return 'lobby';
}

export function roomForCommand(command?: string): Room {
  if (!command) return 'setup';
  for (const [re, room] of COMMAND_RULES) if (re.test(command)) return room;
  return 'setup';
}

export function isTestCommand(command?: string): boolean {
  return !!command && COMMAND_RULES[0][0].test(command);
}
