# Buildscape

**Describe an app. Watch it get built like a house.** Buildscape is a friendly wrapper around an AI coding
agent for people who do not code. You type an idea, a builder (Claude Code) makes the app, and a guide AI
turns everything the builder does into plain words. You never see code, file names or commands. You see
one window per stage of the build, each with a small animated scene and the jobs that got done there.

| Stage | What it really is |
| --- | --- |
| Blueprint | Understanding your idea and planning it |
| Foundation | Setting up the project and its tools |
| Walls and windows | The screens people see and touch (frontend) |
| Wiring | The rules that make the app do things (logic) |
| Storage room | Saving information (database) |
| Inspection | Checking that everything works (tests) |
| Move-in day | Your app is ready to open |

Built at sunhacks 2026.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer and [Claude Code](https://claude.com/claude-code)
installed and signed in (running `claude` in a terminal should work).

```bash
npm install
npm start
```

Open http://localhost:4321, type what you want to build and press **Start building**.
No Claude Code on this computer? Press **Watch a demo build**: it replays a real recorded build.

Optional: copy `.env.example` to `.env` and add a free `GEMINI_API_KEY` from
https://aistudio.google.com/apikey. With the key, Gemini writes the explanations for your specific app.
Without it, Buildscape uses built-in sentences and still works. The terminal prints which one is active.

For development with hot reload: `npm run dev`, then open http://localhost:5173.

## How it works

```
You type an idea
      |
brain/ (Node, port 4321) ── starts ──> Claude Code (headless, in ~/Buildscape/<your-app>)
      |   ^                                 |
      |   └──── hooks: every step, before it happens ─┘
      |
      |  stages.ts      which of the 7 stages does this step belong to?
      |  translator.ts  the guide: raw steps -> one friendly sentence + finished jobs (Gemini or built-in)
      |  story.ts       the story the person sees, recorded to runs/
      v
web/ (Vite + TypeScript, SVG scenes) <── WebSocket: only friendly messages (shared/story.ts)
```

- **The builder can be paused.** Before the first building step, the brain holds Claude Code's hook open,
  shows the plan as a few plain bullets and waits for "Yes, build it". Installing parts or anything hard
  to undo also asks first.
- **Problems are part of the story.** When a check fails, the person sees "the builder found a problem
  and is fixing it" and the build walks back to the room that needs the fix.
- **Changes.** On move-in day you can open the app and ask for a change in your own words.
- **Local only.** The brain listens on 127.0.0.1 and refuses pages from other origins, because it can
  start a coding agent.

## Folders

- `shared/story.ts` the contract between brain and web: stages, lessons and message types.
- `brain/` runner (starts Claude Code), hooks, stage rules, translator, story and server.
- `web/` start screen, stage windows, scenes, builder questions, sounds, and the recorded demo
  (`web/public/demo.jsonl`, `web/public/demo-app/`).
- `runs/` recordings of your own builds (not committed). Copy one to `web/public/demo.jsonl` to make it the demo.

## Credits and AI use

See [docs/AI_USAGE.md](docs/AI_USAGE.md). All drawings are SVG made in code; all sounds are synthesized in
the browser. Stage ideas, the hardhat builder and the color mood were inspired by our teammate's
prototype, [vibeerr](https://github.com/DevBehruz/vibeerr).
