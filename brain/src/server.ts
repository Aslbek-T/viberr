import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { HOST, PORT, PROJECTS_DIR, ROOT } from './config.ts';
import { handleMessage } from './router.ts';
import { runner } from './runner.ts';
import { story } from './story.ts';
import { checkGemini, narratorKind } from './translator.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));

// The brain can start a coding agent, so only pages served from this computer may call it.
const local = (origin?: string) => !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
app.use('/api', (req, res, next) => {
  if (!local(req.headers.origin)) { res.status(403).json({ ok: false, error: 'Only this computer can use Buildscape.' }); return; }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, running: story.state.running, narrator: narratorKind() }));

app.post('/api/run', (req, res) => {
  const idea = String(req.body?.idea ?? '').trim().slice(0, 2000);
  if (idea.length < 3) { res.status(400).json({ ok: false, error: 'Tell the builder what you want to make.' }); return; }
  res.json(runner.start(idea, req.body?.change === true));
});
// The one chat box: a question gets an answer, an idea starts a build, a request changes the app.
app.post('/api/message', async (req, res) => {
  const text = String(req.body?.text ?? '').trim().slice(0, 2000);
  if (text.length < 3) { res.status(400).json({ ok: false, error: 'Type a question or describe what you want to make.' }); return; }
  try { res.json(await handleMessage(text)); } catch (err) { console.error('[message]', err); res.json({ ok: false, error: 'Something went wrong. Try again.' }); }
});
app.post('/api/stop', (_req, res) => { runner.stop(); res.json({ ok: true }); });

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
app.get('/handoff', (_req, res) => {
  const file = runner.dir && path.join(runner.dir, 'PROJECT_GUIDE.md');
  if (!file || !fs.existsSync(file)) { res.status(404).send('No developer guide yet.'); return; }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const body = esc(fs.readFileSync(file, 'utf8')).split('\n').map((l) => {
    const h = l.match(/^(#{1,3})\s+(.*)/);
    if (h) return `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
    return l.trim() ? `<p>${l.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</p>` : '';
  }).join('\n');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Developer guide</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#16302a;background:#fbf8ea}h1,h2,h3{line-height:1.2;margin:1.4em 0 .4em}p{margin:.25em 0}code{background:#ece6cc;padding:1px 5px;border-radius:4px}</style>${body}`);
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
  console.log(`\n  Buildscape is running: http://localhost:${PORT}`);
  console.log(`  Projects are built in: ${PROJECTS_DIR}`);
  void checkGemini().then((line) => console.log(`  Guide: ${line}\n`));
});
