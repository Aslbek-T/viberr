import { config as loadEnv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: path.join(ROOT, '.env') });
loadEnv({ path: path.join(ROOT, '.env.local') });

/** An env value, treating an empty line in .env (like `PORT=`) as not set. */
const env = (name: string) => process.env[name]?.trim() || undefined;

export const PORT = Number(env('PORT') ?? 4321);
// Only this computer can reach the brain: it can start a coding agent, so it must never be public.
export const HOST = '127.0.0.1';
// Projects are built outside this repo so Claude Code doesn't read our own AGENTS.md as instructions.
export const PROJECTS_DIR = env('BUILDSCAPE_PROJECTS_DIR') ?? path.join(os.homedir(), 'Buildscape');
export const RUNS_DIR = path.join(ROOT, 'runs');
export const GEMINI_API_KEY = env('GEMINI_API_KEY') ?? '';
export const GEMINI_MODEL = env('GEMINI_MODEL') ?? '';
export const CLAUDE_BIN = env('BUILDSCAPE_CLAUDE_BIN') ?? 'claude';
export const CLAUDE_MODEL = env('BUILDSCAPE_CLAUDE_MODEL') ?? '';
/** How long the builder waits for the user's answer before giving up on that step. */
export const ASK_TIMEOUT_MS = 9 * 60_000;
