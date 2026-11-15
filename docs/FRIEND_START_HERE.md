# Start here: your part of Buildscape

Hey! You own the **World**: everything the user sees in the browser. Aslbek owns the **Brain**: the server
that listens to Claude Code, Cursor and Codex and sends events to your app. You two only meet at one file,
`shared/events.ts`, so you never have to wait on each other.

Read `AGENTS.md` once (10 minutes). It has the full plan, and every AI tool reads it too, so you never
have to re-explain the project to Codex, Cursor or ChatGPT.

## Who does what

| | You (World) | Aslbek (Brain) |
| --- | --- | --- |
| Main tools | Codex for code, ChatGPT Pro for images, Cursor for polish and the kitchen theme | Claude Code for code, Cursor as a test agent, Grok for the bot |
| Folder | `web/`, `shared/i18n/`, `web/public/assets/` | `brain/`, `shared/events.ts`, `shared/concepts.json` |
| Builds | Building scene, characters, narrator panel, concept and decision cards, onboarding, themes, accessibility, languages, end screen, landing page | Agent adapters, event server, replay, AI narrator, decisions and phone ping, memory, Gemini, Grok Bot, recorded demo sessions |
| Sleeps | 5:00 to 8:00 AM | 2:00 to 5:00 AM |
| Final morning | Record and edit the video, upload to YouTube | Devpost write-up, README, AI credits |

## Your first 45 minutes

1. Accept the GitHub invite from Aslbek (`Aslbek-T`) and clone the repo.
2. Make sure `AGENTS.md` is at the repo root. Codex reads it automatically.
3. Look at the mockup we made: https://claude.ai/artifact/7TGNnnCp28jKwtT58vBrZe (if you can't open it,
   ask Aslbek for a screenshot).
4. Open 3 ChatGPT chats (Lab, Kitchen, Characters) and start generating images from `ASSET_PROMPTS.md`.
   Let them run while Codex works.
5. Give Codex ticket B0 (below). **Build against the fixture files in `sessions/fixtures/` from the
   start.** You do not need Aslbek's server running to make progress.

## Checkpoints you must hit

| Time (MST) | You must have |
| --- | --- |
| 9:15 PM | Reviewed `shared/events.ts` with Aslbek and said OK |
| 12:00 AM | Your app plays a fixture session end to end: characters move, captions show |
| 2:00 AM | **MVP:** decision card, onboarding and replay picker work against Aslbek's live server |
| 5:00 AM | Lab and kitchen themes, accessibility done. Push everything, write a 5-line handoff note in `docs/HANDOFF.md`, then sleep |
| 8:30 AM | Feature freeze. Only bug fixes after this |
| 10:15 AM | Video uploaded to YouTube |

## Codex tickets (paste one at a time)

Start every Codex task with: *"Read AGENTS.md first. You are working on the World lane, only in `web/`."*
Run two tickets in parallel only if they touch different files.

**B0 setup**
> Create a Vite + TypeScript + Phaser 3 app in `web/`. Add `src/net/socket.ts` that connects to
> `ws://localhost:4321/ws`, parses `ServerMsg` from `shared/events.ts`, auto-reconnects every 2 s, and
> exposes an event emitter. Add a dev fallback: if `?fixture=<name>` is in the URL, load
> `sessions/fixtures/<name>.jsonl` and emit its events on their original timing instead of using the
> socket. Show a small "Brain connected / Replay from file" badge.

**B1 building**
> Create `src/scenes/Building.ts`: a cutaway building with 3 floors as in AGENTS.md section 4 and
> ASSET_PROMPTS.md. Each room is a rectangle with a background image if
> `assets/<theme>/<room>.png` exists, otherwise a flat color. Draw the room name from
> `themes/<theme>/theme.ts` as text in code. Active room glows for 3 s after an event. Theme is set
> from the profile.

**B2 characters**
> Add characters: one per `agentId`, from `assets/common/char-<source>.png` (4-frame sheet: idle,
> walk, work, raise hand), tinted fallback circle if missing. On each `event`, walk to that room's floor
> area (tween, 600 ms; with `reducedMotion`, fade instead), play the work pose, show a speech bubble with
> `summary` for 3 s. On `waiting_for_user`, show the raise-hand pose. Name label under every character.

**B3 narrator panel and concept cards**
> Add `NarratorPanel`: a caption strip at the bottom showing the latest `narration.text` (large
> readable font, high contrast), and a scrollable step timeline on the right (icon, room, one line).
> Add `ConceptCard`: slides in on a `concept` message with title, one-liner and the analogy for the
> current theme; if `seenBefore`, show "You learned this before" instead and auto-dismiss. "Got it"
> sends `{type:'learned'}`.

**B4 decision card**
> Add `DecisionCard`: a modal on `decision` messages with the question, each option as a big button with
> its plain explanation, and a "Recommended" badge on `recommended`. Sends `{type:'decide'}`. Fully
> keyboard accessible (Tab, Enter, Esc does nothing since a choice is required). Play a soft sound.

**B5 onboarding**
> Add `src/scenes/Onboarding.ts`: 4 friendly screens. (1) What's your field? (Biology, Chemistry,
> Physics, Medicine, Business, Art, Cooking/Just for fun, Other). (2) How much coding do you know?
> (None, A little, I'm a developer) -> level new/some/dev. (3) How do you like to learn? (Pictures,
> Reading, Listening). (4) Accessibility toggles. Biology/Chemistry/Medicine -> lab, Cooking/Just for
> fun -> kitchen, else office. Save the `UserProfile` to localStorage and send `{type:'profile'}`.

**B6 replay**
> Add a replay picker that lists `GET /api/sessions`, plays one with `{type:'replay'}` and a speed
> selector (1x, 2x, 4x, 8x). Show a Live or Replay badge from the `status` message.

**B7 themes** (do this one in **Cursor Agent**, and screen-record 30 s of it for the SpaceXSI write-up)
> Add `src/themes/lab/theme.ts` and `src/themes/kitchen/theme.ts` with room display names from
> AGENTS.md section 4, palette, background image paths and ambient particle effects (lab: bubbles,
> kitchen: steam). Theme switcher in settings.

**B8 accessibility**
> Add `src/ui/Settings.ts` and `src/a11y/`: reduced motion, color-safe palette (Okabe-Ito, from
> AGENTS.md), OpenDyslexic font toggle, captions on by default, voice narration via Web Speech API
> reading `narration.text` in the chosen language, visible focus rings, all controls keyboard reachable.

**B9 languages**
> Move all UI strings into `shared/i18n/en.json`, add `es.json` and `uz.json` translations, and a
> language picker. The narrator text comes from the Brain already translated, using `lang` in the profile.

**B10 end screen**
> Add `src/scenes/Summary.ts`, shown on a `done` event: the building as a map, each room with what was
> built there in one line, and the collected concept cards. Button "Start another session".

**B11 landing page** (only if time)
> A one-page landing site with a hero GIF, 3 feature blocks and a "Try the demo" button that opens the
> hosted replay. Deploy to Vercel and point the GoDaddy domain at it (promo code `MLHSUN75`).

## Rules that keep us safe

- Never edit `shared/events.ts` or anything in `brain/` without telling Aslbek first.
- Everything must work in replay mode with no internet. Test with `?fixture=lab-demo` often.
- Push small and often to `world/*` branches; keep `main` runnable.
- No text inside generated images. The app draws all text so it can translate it and switch fonts.
- If a task takes more than 45 minutes, stop and message Aslbek. We cut, we don't get stuck.
- After each task, add one line to `docs/AI_USAGE.md` (which AI built what). sunhacks requires AI credit.

## Video (9:15 to 10:15 AM)

The script is in the plan doc's "Demo video script" section. Record from golden replays (identical every
take), 1080p, captions burned in, under 2:00. Upload to YouTube as unlisted and send Aslbek the link by
10:15 AM.
