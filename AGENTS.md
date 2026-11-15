# AGENTS.md: Vibeerr shared context

> Read this before writing code. It is the source of truth for every AI model working on this repo
> (Claude Code, Codex, Cursor). `CLAUDE.md` only contains `@AGENTS.md`.

## What we are building

**Vibeerr** is a friendly wrapper around an AI coding agent for people who do not code.
The person types an idea, picks a folder, and picks an AI they already have (Claude, Cursor, or Codex).
The brain starts that AI. A guide sits between the agent and the person and turns raw activity into plain
words. The person never sees code, file names, or commands. They see the build as a **building site**: one
district per stage, every part of the app is a block in its district, and the builder walks between the
blocks (style from our teammate's VibeWorld, github.com/DevBehruz/vibeerr). One chat box: a question gets a
plain answer, an app idea starts a build, and a note during a build is saved for the builder.

- **Event:** sunhacks 2026 at ASU. Devpost deadline **Sunday Nov 15, 2026, 11:00 AM MST**. Submit by 10:30. Code freeze 9:00.
- **Judging:** originality, complexity, completeness, design.
- **Keep it simple.** One theme (block site), seven stages, and only an AI the person already has: Claude, Cursor, or Codex. No extra themes.
- **No paid APIs.** Each builder runs on the user's own login. Gemini free tier is optional. Everything must work with no keys. A `VIBEERR.md` brief in the project folder is rewritten as the work changes so those AIs can take turns.

## The seven stages (`shared/story.ts`)

| id | Site name | What it really is |
| --- | --- | --- |
| `plan` | Idea | A short plan the person can edit before anything is built |
| `setup` | Start | Getting a folder ready |
| `look` | Pages | What they see and tap |
| `logic` | Actions | What happens when they use it |
| `memory` | Saved | What is still there tomorrow |
| `check` | Try out | Making sure it really works |
| `done` | Done | Ready to use, with a plain summary and a developer handoff |

## Architecture

```
web/ (Vite + TS, SVG) <── WebSocket /ws: StoryMsg only ── brain/ (Node, 127.0.0.1:4321) ── spawns ──> claude -p
                                                              ^── POST /hook/claude (PreToolUse, PostToolUse) ──┘
```

- `brain/src/runner.ts` starts the chosen AI in the folder the person picked. Claude uses hooks and can pause
  for the edited plan. Cursor and Codex write `PLAN.md`, stop, and continue only after the person edits it.
  Every change rewrites `VIBEERR.md` in that folder.
- `brain/src/stages.ts` maps a raw step (file written, command run) to a stage. `null` means "no opinion".
- `brain/src/translator.ts` is the guide: Gemini if `GEMINI_API_KEY` is set, built-in sentences otherwise or on any failure.
- `brain/src/story.ts` batches raw steps every 3.5 s, emits `stage`, `now`, `task`, `block`, `ask`, `finished`, and records to `runs/`.
- `brain/src/router.ts` the chat box: Gemini (or rules of thumb) decides question / build / change. Questions are answered by Gemini, or by `claude -p --tools ""` without a key.
- `brain/src/server.ts` REST: `POST /api/message {text}`, `POST /api/run {idea, change?}`, `POST /api/stop`, `GET /health`, `/preview/*` (the built app), `/handoff` (PROJECT_GUIDE.md the builder writes for developers).
- `web/src/main.ts` screens and pacing, `world.ts` the SVG block site and walking builder, `net.ts` live feed and demo player, `audio.ts` sounds.
- `scripts/make-demo.mjs` writes `web/public/demo.jsonl`.

## Rules

1. **Nothing technical reaches the browser.** Raw steps stay inside `brain/`. The browser only gets `StoryMsg`.
2. **Plain language is the product.** Every sentence must make sense to someone who has never coded.
   A real term (frontend, database, test) is fine if the same sentence explains it.
3. `shared/story.ts` is the contract. Import types from it, never redefine them. Tell your teammate before changing it.
4. **The demo must always work with no network and no keys** (`web/public/demo.jsonl`).
5. Every animation respects `prefers-reduced-motion`. Everything works with the keyboard.
6. No secrets in git. Keys live in `.env` only.
7. The brain binds to 127.0.0.1 and checks the Origin header. Keep it that way: it can start a coding agent.
8. `main` must always run with `npm install && npm start`. Run `npm run typecheck` before pushing.
