import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

export const PORT = Number(process.env.PORT ?? 4321);
export const SESSIONS_DIR = path.join(ROOT, 'sessions');
export const NO_WAIT = process.env.BUILDSCAPE_NO_WAIT === '1';
export const DECISION_TIMEOUT_MS = 60_000;
