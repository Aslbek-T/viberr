import { defineConfig } from 'vite';

// In development the page runs on 5173 and talks to the brain on 4321.
const BRAIN = 'http://localhost:4321';
export default defineConfig({
  build: { target: 'es2022' },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: BRAIN, ws: true },
      '/api': BRAIN,
      '/health': BRAIN,
      '/preview': BRAIN,
      '/handoff': BRAIN,
    },
  },
});
