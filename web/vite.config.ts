import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const SESSIONS = path.resolve(__dirname, '../sessions');
const PUBLISHED = ['fixtures', 'golden']; // never publish sessions/live or raw

function listPublished(): string[] {
  return PUBLISHED.flatMap((d) => {
    const dir = path.join(SESSIONS, d);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => `${d}/${f}`) : [];
  });
}

/** Serves ../sessions at /sessions in dev and copies fixtures + golden into the build for hosted replay. */
function sessionsPlugin(): Plugin {
  return {
    name: 'buildscape-sessions',
    configureServer(server) {
      server.middlewares.use('/sessions', (req, res, next) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
        if (url === '/index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(listPublished()));
          return;
        }
        const file = path.join(SESSIONS, url);
        if (!file.startsWith(SESSIONS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', 'application/x-ndjson');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = path.resolve(__dirname, 'dist/sessions');
      for (const rel of listPublished()) {
        fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
        fs.copyFileSync(path.join(SESSIONS, rel), path.join(out, rel));
      }
      fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(listPublished()));
    },
  };
}

const BRAIN = 'http://localhost:4321';
export default defineConfig({
  plugins: [sessionsPlugin()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: BRAIN, ws: true },
      '/api': BRAIN,
      '/health': BRAIN,
    },
  },
});
