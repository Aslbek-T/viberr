import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, type AgentId } from '../../shared/story.ts';

// Finds the AI programs the person already has. Vibeerr never installs one for them.
// `cursor agent` is intentionally not called: that command tries to download a program.

const CODEX_FALLBACK = path.join(os.homedir(), '.codex/plugins/.plugin-appserver/codex-cli/bin/codex');
// The Cursor install puts `agent` here. A normal terminal may not have that folder on PATH.
const CURSOR_FALLBACKS = ['agent', 'cursor-agent'].map((name) => path.join(os.homedir(), '.local/bin', name));

function which(name: string): string | null {
  const found = spawnSync('which', [name], { encoding: 'utf8' });
  const bin = found.status === 0 ? found.stdout.trim() : '';
  return bin || null;
}

function binFor(id: AgentId): string | null {
  if (id === 'claude') return which('claude');
  if (id === 'codex') return which('codex') ?? (fs.existsSync(CODEX_FALLBACK) ? CODEX_FALLBACK : null);
  return which('agent') ?? which('cursor-agent') ?? CURSOR_FALLBACKS.find((bin) => fs.existsSync(bin)) ?? null;
}

const cache = new Map<AgentId, { at: number; ready: boolean; bin: string; detail: string }>();

function versionOk(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(bin, ['--version'], { stdio: 'ignore' }); } catch { resolve(false); return; }
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(false); }, 8000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

const missing = (id: AgentId) => id === 'cursor'
  ? 'Cursor’s agent program is not on this computer yet. Pick Claude or Codex, or install the Cursor agent and try again.'
  : id === 'codex'
    ? 'Codex is not on this computer yet. Pick Claude or Cursor, or install Codex and try again.'
    : 'Claude Code is not on this computer yet. Install it, sign in, and try again.';

/** Checks one AI. The result is remembered for a short time so the screen stays quick. */
export async function resolveAgent(id: AgentId) {
  const meta = AGENTS.find((a) => a.id === id)!;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 30_000) return { ...hit, label: meta.label };
  const bin = binFor(id);
  let ready = false;
  let detail = missing(id);
  if (bin) {
    ready = await versionOk(bin);
    detail = ready ? `${meta.label} is ready on this computer.` : `${meta.label} was found but did not answer. Open it once to sign in, then try again.`;
  }
  const row = { at: Date.now(), ready, bin: bin ?? '', detail };
  cache.set(id, row);
  return { ...row, label: meta.label };
}

export async function listAgents() {
  return Promise.all(AGENTS.map(async (a) => {
    const found = await resolveAgent(a.id);
    return { id: a.id, label: a.label, blurb: a.blurb, ready: found.ready, detail: found.detail };
  }));
}
