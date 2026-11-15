# Vibeerr

**Describe an app. Watch it get built, in plain words.** Vibeerr is a friendly wrapper around an AI the person
already has (Claude, Cursor, or Codex). One chat box: a question gets a plain answer; an app idea starts a
build. The builder writes a short plan the person can edit, then builds it on a site with one district per part
of an app. A guide explains each part. Notes can be sent while it works. At the end there is a plain summary
and a guide for any developer who joins later. `VIBEERR.md` in the project folder lets a different AI continue.

| District | What it really is |
| --- | --- |
| Idea | What you want, in words you can edit |
| Start | Getting a folder ready |
| Pages | What you see and tap |
| Actions | What happens when you use it |
| Saved | What is still there tomorrow |
| Try out | Making sure it really works |
| Done | Your app is ready to open |

The block-site style comes from our teammate's VibeWorld prototype: https://github.com/DevBehruz/vibeerr

Built at sunhacks 2026.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer and one builder installed and signed in:
Claude Code (`claude`), Cursor's agent (`agent` or `cursor-agent`), or Codex (`codex`).
Choose that builder and a project folder in Vibeerr. Each uses your existing login; no API key is required.

```bash
npm install
npm start
```

Open http://localhost:4321, type a question or what you want to build and press **Send**.
No builder on this computer? Press **Watch a demo build**: it replays a real recorded build.

Optional: copy `.env.example` to `.env` and add a free `GEMINI_API_KEY` from
https://aistudio.google.com/apikey. With the key, Gemini writes the explanations for your specific app.
Without it, Vibeerr uses built-in sentences and still works. The terminal prints which one is active.

Optional review: add `XAI_API_KEY` (from https://console.x.ai) and Grok gives each finished app a second opinion: what works, a score, and up to three improvements you can send to the builder with one click.

Optional voice: add `ELEVENLABS_API_KEY` (from https://elevenlabs.io/app/settings/api-keys) to `.env` and the
guide reads every step aloud in a natural voice. Questions from the builder are read out too, and you can answer
them by voice: press **Answer by voice** and say "yes" or "not yet". After you use the microphone once, Vibeerr
listens by itself after each question. A spoken answer only sends the suggested choice; anything else, like
allowing a step that is hard to undo, still needs a press. There is also a **Speak** button to dictate an idea or a
note. Without the key, the browser's own voice and speech recognition are used (best in Chrome or Edge). Turn the
voice off with **Voice on/off** at the top.

For development with hot reload: `npm run dev`, then open http://localhost:5173.

## How it works

```
You type an idea
      |
brain/ (Node, port 4321) ── starts ──> Claude, Cursor, or Codex (in the folder you picked)
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
- **Cursor and Codex plan first.** They write the plan and stop while you edit it. After approval,
  a second run builds the app. Codex runs in its project sandbox with interactive approvals disabled;
  commands that require extra permission fail. Its progress and check results go through the guide.
- **Changes.** On move-in day you can open the app and ask for a change in your own words.
- **Local only.** The brain listens on 127.0.0.1 and refuses pages from other origins, because it can
  start a coding agent.

## Folders

- `shared/story.ts` the contract between brain and web: stages, lessons and message types.
- `brain/` runner (starts Claude, Cursor, or Codex), hooks, stage rules, translator, story and server.
- `web/` start screen, stage windows, scenes, builder questions, sounds, and the recorded demo
  (`web/public/demo.jsonl`, `web/public/demo-app/`).
- `runs/` recordings of your own builds (not committed). Copy one to `web/public/demo.jsonl` to make it the demo.

## Credits and AI use

See [docs/AI_USAGE.md](docs/AI_USAGE.md). All drawings are SVG made in code; all sounds are synthesized in
the browser. Stage ideas, the hardhat builder and the color mood were inspired by our teammate's
prototype, [vibeerr](https://github.com/DevBehruz/vibeerr).
