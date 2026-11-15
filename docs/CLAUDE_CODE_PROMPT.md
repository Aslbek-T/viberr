# Prompt for Claude Code: make Buildscape demo-ready

Paste everything below the line into Claude Code, opened in the `viberr` folder.

---

Read `AGENTS.md` first. It explains Buildscape, the contract in `shared/events.ts`, and the rules. The
starter already works: `npm start` serves the app on http://localhost:4321, Claude Code hooks reach the
brain (`brain/src/adapters/claude.ts`), and replays play from `sessions/fixtures/`. Run
`npm run hooks:test` to send fake hook events through the real hook script.

Your job: make the **most showable parts** for a 2-minute hackathon demo video and judges (originality,
complexity, completeness, design). The judges must instantly get the idea: "AI agents working in a
building, and a non-coder understands what they're doing." **No paid APIs.** Everything must work
offline in replay mode. Work in this order. After each phase: run `npm run typecheck` and
`npm run build`, open the app with a replay to check it, commit with a clear message, and print a
2-line summary of what changed. Don't change `shared/events.ts` except to add optional fields.

## Phase 1: make the building feel alive (most important, ~60 min)
In `web/src/scenes/Building.ts`, with no image files needed (draw everything with Phaser Graphics):
- **Furniture per room and theme**, drawn procedurally: lab = benches, microscope, freezer with drawers,
  shelves of colored bottles; kitchen = counter, stove, order window with a bell, pantry shelves, crates;
  office = desks, filing cabinets, mailboxes. Simple shapes, cozy colors, readable at small size.
- **Better characters**: a small robot with head, body, two arms and legs, tinted by agent color
  (`shared/themes.ts`). Walk animation (legs swing, body bobs), work animation that fits the event:
  typing for `file_edit`, reading a clipboard for `file_read`, pressing buttons for `shell`, holding a
  test tube for `test_run`, a raised hand for `waiting_for_user`, a happy jump for `done`, a shake
  plus a red "!" for `error`. Walking goes along the floor and uses a stairwell at the right edge to
  change floors.
- **Room progress**: each room gets a small "built" meter that fills a little each time a file is edited
  there, and shows the files built in a tooltip on hover. This is the "big picture" view.
- **Ambient life**: bubbles in the lab, steam in the kitchen, a glow on the active room, and a soft
  day/night sky gradient behind the building.
- Respect `reducedMotion` (no walking, just fade between rooms; no particles) and `colorSafe`.

## Phase 2: teaching moments that look like a game (~40 min)
- **Concept collection**: a "Notebook" button in the top bar that opens a drawer of collected concept
  cards (grayed-out locked ones too, like a collection). Show a "+1 concept" toast with a small star burst
  when a new one is learned. Count and progress ("4 of 10 ideas learned").
- **"What did I just build?" summary screen** in `web/src/scenes/Summary.ts` on a `done` event (and from
  a button): the building drawn as a simple map, each room labeled with its plain-language meaning
  (`ROOM_MEANING`) and the files made there, with arrows showing how Screens → API → Database connect.
  This is the key teaching moment for the video.
- Improve `brain/src/narrator/template.ts`: more varied sentences (pick from 2 to 3 variants per kind,
  by event id so they're stable), and theme-flavored analogies (lab and kitchen words). Spanish
  versions of the template sentences when `lang === 'es'`.

## Phase 3: "you don't have to watch" (~40 min)
- **Mobile decision page**: `/decide` in the web app shows only the current decision card, big and
  thumb-friendly, and the current caption. Make sure it works on a phone on the same Wi-Fi (the brain
  should listen on all interfaces, and print the LAN URL at startup, e.g. `http://192.168.x.x:4321/decide`).
  Set the ntfy `Click` link to that URL so tapping the phone notification opens the card.
- **Away mode**: a toggle "I'm stepping away". While on, the browser plays a gentle chime and shows a
  big banner when a decision arrives, and the narrator collects a short "while you were away" recap of
  what happened (a list of the steps grouped by room), shown when the user returns.

## Phase 4: more agents (~60 min)
- **Cursor adapter** `brain/src/adapters/cursor.ts` + `POST /hook/cursor` + `brain/hooks/cursor-hook.sh`
  + an installer `npm run hooks:install:cursor -- <dir>` that writes `<dir>/.cursor/hooks.json` with
  `beforeShellExecution`, `afterFileEdit`, `beforeReadFile`, `beforeSubmitPrompt` and `stop`. First log
  raw payloads to `sessions/raw/cursor.jsonl` and map only fields you actually see; be defensive about
  missing fields. `beforeShellExecution` can wait for a decision like the Claude adapter (answer with
  Cursor's permission allow/deny/ask format; on timeout answer ask).
- **Codex adapter** `brain/src/adapters/codex.ts`: watch `~/.codex/sessions/**/rollout-*.jsonl` with
  chokidar (add the dependency), read new lines as they are appended, and map tool calls, shell commands,
  file patches and messages to `BuildEvent`s with `source: 'codex'`. Also a `notify` script for when a
  turn ends. Be defensive: unknown line types are logged and skipped.
- Make the fixture generator (`brain/scripts/make-fixtures.ts`) produce a richer kitchen demo with all
  three agents (Claude, Cursor, Codex) working at the same time in different rooms.

## Phase 5: free smarter narration (optional, ~30 min)
- `brain/src/narrator/gemini.ts` using the Gemini API free tier (`GEMINI_API_KEY`, model
  `gemini-2.0-flash` or newer Flash). One or two sentences, the user's level, theme and language, no
  jargon. 3-second timeout, cache, and fall back to the template on any error. Select with
  `NARRATOR=gemini`. Never block the event broadcast on narration.

## Rules
- Plain language for every user-facing word. A biologist who never coded must understand it.
- Keep `npm start` working at every commit. Keep replay mode working with no network.
- Log what you built in `docs/AI_USAGE.md` (one line per phase).
- If something takes more than 45 minutes or needs a paid service, stop and tell me.
