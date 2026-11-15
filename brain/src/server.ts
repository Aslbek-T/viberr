import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { HOST, PORT, PROJECTS_DIR, ROOT } from './config.ts';
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
