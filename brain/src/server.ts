import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { isAgentId } from '../../shared/story.ts';
import { listAgents } from './agents.ts';
import { HOST, PORT, PROJECTS_DIR, ROOT } from './config.ts';
import { handleMessage } from './router.ts';
import { runner } from './runner.ts';
import { story } from './story.ts';
import { checkGemini, narratorKind } from './translator.ts';
import { listen, speak, voiceKind, voiceLine } from './voice.ts';
import { reviewerLine } from './review.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));

// The brain can start a coding agent, so only pages served from this computer may call it.
const local = (origin?: string) => !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
app.use(['/api', '/hook'], (req, res, next) => {
  if (!local(req.headers.origin)) { res.status(403).json({ ok: false, error: 'Only this computer can use Vibeerr.' }); return; }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, running: story.state.running, narrator: narratorKind() }));

app.get('/api/ready', async (_req, res) => {
  res.json({ ok: true, folder: PROJECTS_DIR, agents: await listAgents(), voice: voiceKind() });
});

// The guide's voice. 204 means "no natural voice right now": the browser then uses its own.
app.post('/api/speak', async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) { res.status(400).end(); return; }
  const audio = await speak(text);
  if (!audio) { res.status(204).end(); return; }
  res.set('Cache-Control', 'no-store').type('audio/mpeg').send(audio);
});
// A short spoken answer, recorded in the browser when it cannot listen by itself.
app.post('/api/listen', express.raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: '4mb' }), async (req, res) => {
  const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const text = await listen(audio, String(req.headers['content-type'] ?? 'audio/webm'));
  res.json(text ? { ok: true, text } : { ok: false, error: 'I did not catch that. Try again, or press a button.' });
});

// Opens the person's own folders and returns the one they pick. The browser cannot see that path itself.
const PICK_FOLDER = `tell application "Finder"
  activate
  set picked to choose folder with prompt "Choose the folder for this app" default location (path to home folder)
  POSIX path of picked
end tell`;

function pickFolder(): Promise<{ ok: true; folder: string } | { ok: false; canceled?: boolean; error: string }> {
  if (process.platform !== 'darwin') {
    return Promise.resolve({ ok: false, error: 'Choosing a folder from a window works on this Mac. Type the folder path instead.' });
  }
  return new Promise((resolve) => {
    const child = spawn('osascript', ['-e', PICK_FOLDER], { timeout: 180_000 });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('error', () => resolve({ ok: false, error: 'The folder window could not open. Type the folder path instead.' }));
    child.on('close', (code) => {
      const folder = out.trim().replace(/\/$/, '');
      if (code === 0 && folder) { resolve({ ok: true, folder }); return; }
      if (/user canceled|user cancelled|-128/i.test(err)) { resolve({ ok: false, canceled: true, error: 'No folder was chosen.' }); return; }
      resolve({ ok: false, error: 'The folder window could not open. Type the folder path instead.' });
    });
  });
}

app.post('/api/pick-folder', async (_req, res) => {
  res.json(await pickFolder());
});

app.post('/api/run', async (req, res) => {
  const idea = String(req.body?.idea ?? '').trim().slice(0, 12000);
  if (idea.length < 3) { res.status(400).json({ ok: false, error: 'Tell the builder what you want to make.' }); return; }
  const agent = isAgentId(req.body?.agent) ? req.body.agent : undefined;
  res.json(await runner.start(idea, { change: req.body?.change === true, folder: String(req.body?.folder ?? ''), agent }));
});
// The one chat box: a question gets an answer, an idea starts a build, a note during a build is saved for the builder.
app.post('/api/message', async (req, res) => {
  const text = String(req.body?.text ?? '').trim().slice(0, 12000);
  if (text.length < 3) { res.status(400).json({ ok: false, error: 'Type a question or describe what you want to make.' }); return; }
  const agent = isAgentId(req.body?.agent) ? req.body.agent : undefined;
  const folder = String(req.body?.folder ?? '').trim().slice(0, 500);
  try { res.json(await handleMessage(text, { folder, agent })); } catch (err) { console.error('[message]', err); res.json({ ok: false, error: 'Something went wrong. Try again.' }); }
});
app.post('/api/switch', async (req, res) => {
  if (!isAgentId(req.body?.agent)) { res.status(400).json({ ok: false, error: 'Pick Claude, Cursor, or Codex.' }); return; }
  try { res.json(await runner.switchTo(req.body.agent)); } catch (err) { console.error('[switch]', err); res.json({ ok: false, error: 'The builder could not be switched.' }); }
});
app.post('/api/stop', (_req, res) => { runner.stop(); res.json({ ok: true }); });
app.post('/api/reset', (_req, res) => { runner.reset(); res.json({ ok: true }); });

// Claude Code hooks. The answer may be held open while the person decides.
app.post('/hook/claude', async (req, res) => {
  try { res.json(await runner.onHook(req.body)); } catch (err) { console.error('[hook]', err); res.json({}); }
});

// The app that was just built, so "Open your app" works.
app.use('/preview', (req, res, next) => {
  if (!runner.dir) { res.status(404).send('Nothing has been built yet.'); return; }
  express.static(runner.dir, { dotfiles: 'ignore' })(req, res, next);
});

// The developer handoff the builder wrote, shown as a simple readable page.
function guideHtml(markdown: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let para: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushList = () => { if (list.length) { html += `<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`; list = []; } };
  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) { html += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = null; }
      else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { flushPara(); flushList(); code = []; continue; }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) { flushPara(); flushList(); html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; continue; }
    const item = line.match(/^\s*[-*]\s+(.*)/);
    if (item) { flushPara(); list.push(item[1]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  if (code) html += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
  flushPara();
  flushList();
  return html;
}

app.get('/handoff', (_req, res) => {
  const file = runner.dir && path.join(runner.dir, 'PROJECT_GUIDE.md');
  if (!file || !fs.existsSync(file)) { res.status(404).send('No developer guide yet.'); return; }
  const body = guideHtml(fs.readFileSync(file, 'utf8'));
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Developer guide</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#16302a;background:#fbf8ea}h1,h2,h3{line-height:1.2;margin:1.4em 0 .4em}p,ul{margin:.4em 0}li{margin:.2em 0}code{background:#ece6cc;padding:1px 5px;border-radius:4px}pre{background:#ece6cc;padding:12px 14px;border-radius:10px;overflow:auto}pre code{background:none;padding:0}</style>${body}`);
});

const dist = path.join(ROOT, 'web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ origin }: { origin?: string }) => local(origin) });
wss.on('connection', (ws) => story.addClient(ws));

server.listen(PORT, HOST, () => {
  console.log(`\n  Vibeerr is running: http://localhost:${PORT}`);
  console.log(`  Projects are built in: ${PROJECTS_DIR}`);
  console.log(`  Voice: ${voiceLine()}`);
  console.log(`  Reviewer: ${reviewerLine()}`);
  void checkGemini().then((line) => console.log(`  Guide: ${line}\n`));
});
