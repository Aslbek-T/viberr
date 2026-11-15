import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { PORT, ROOT } from './config.ts';
import { CONCEPTS, learnedConcepts } from './concepts.ts';
import { handleClaudeHook } from './adapters/claude.ts';
import { hub } from './hub.ts';
import { listSessions, startReplay, stopReplay } from './replay.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: hub.mode, sources: [...hub.sources], clients: hub.clients.size });
});

// --- Adapter input ---
app.post('/hook/claude', async (req, res) => {
  try { res.json(await handleClaudeHook(req.body)); } catch (err) {
    console.error('[claude] hook failed', err);
    res.json({});
  }
});
// TODO(A6): /hook/cursor   TODO(A7): /hook/codex

// --- Browser API ---
app.get('/api/sessions', (_req, res) => res.json(listSessions()));
app.get('/api/concepts', (_req, res) => res.json(CONCEPTS));
app.get('/api/memory/:userId', (req, res) => res.json(learnedConcepts(req.params.userId)));
app.post('/api/replay', (req, res) => {
  const { file, speed } = req.body ?? {};
  startReplay(String(file), Number(speed) || 1).catch((e) => console.error('[replay]', e));
  res.json({ ok: true });
});
app.post('/api/replay/stop', (_req, res) => { stopReplay(); res.json({ ok: true }); });

// Session files for the web app's offline fixture mode.
app.use('/sessions', express.static(path.join(ROOT, 'sessions'), { dotfiles: 'deny' }));

// Serve the built web app too, so live mode works in any browser at http://localhost:4321
const dist = path.join(ROOT, 'web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

hub.onReplayRequest = (file, speed) => { startReplay(file, speed).catch((e) => console.error('[replay]', e)); };

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => hub.addClient(ws));

server.listen(PORT, () => {
  console.log(`\n  Buildscape brain on http://localhost:${PORT}  (ws: /ws)`);
  console.log(`  narrator: ${process.env.NARRATOR ?? 'template'}  sessions: ${listSessions().length}\n`);
});
