# Buildscape

**Watch, understand and steer your AI coding agent.** Buildscape turns a live Claude Code, Cursor or Codex
session into a little building where agent characters walk between rooms (Screens, API, Database, Login,
Tests, Setup). A narrator explains every step in plain language, concept cards teach the big picture,
and when the agent needs you, you get a ping and a decision card instead of babysitting a terminal.

Built at sunhacks 2026.

## Run it

```bash
npm install
npm start            # builds the web app and starts the brain on http://localhost:4321
```

Open http://localhost:4321, answer the 4 onboarding questions, then pick a session from **Replay**
(for example `fixtures/lab-demo`).

For development with hot reload: `npm run dev`, then open http://localhost:5173.
No brain running? Open http://localhost:5173/?fixture=lab-demo and the web app plays it by itself.

## Watch your own Claude Code session

```bash
npm run hooks:install -- /path/to/your/project   # adds hooks to <project>/.claude/settings.json
npm start                                         # keep this running
cd /path/to/your/project && claude                 # work as usual, watch the building
```

Risky commands (installs, deletes, `git push`) show a decision card in the browser. Your answer goes
straight back to Claude Code. No answer in 60 s and the normal terminal prompt takes over.
Set `BUILDSCAPE_NO_WAIT=1` to turn that off.

Phone pings: install the free ntfy app, subscribe to a topic, and set `NTFY_TOPIC` in `.env.local`.

## How it works

```
Claude Code hooks ─┐
Cursor hooks.json ─┼─> brain/ (Node, :4321) ──WebSocket──> web/ (Vite + Phaser)
Codex logs+notify ─┘   normalize → narrate → teach → record
```

- `shared/events.ts` is the contract between the two halves.
- `brain/` adapters, room rules, narrator, decisions, recorder and replayer.
- `web/` the building, characters, captions, concept and decision cards, onboarding, accessibility.
- `sessions/` recorded sessions (`fixtures/` hand-made, `golden/` real recordings for the demo).

See [AGENTS.md](AGENTS.md) for the full plan and task list.

## Credits and AI use

See [docs/AI_USAGE.md](docs/AI_USAGE.md). Art: generated with ChatGPT image generation by the team, plus CC0
packs from Kenney.nl where noted.
