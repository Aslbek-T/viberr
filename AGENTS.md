# AGENTS.md: Buildscape shared context

> Read this whole file before writing any code. It is the single source of truth for every AI model
> working on this repo: Claude Code, Codex, Cursor, ChatGPT and Grok. Put it at the repo root.
> Codex and Cursor read `AGENTS.md` automatically. For Claude Code, the repo's `CLAUDE.md` contains
> one line: `@AGENTS.md`.

## 1. What we are building

**Buildscape** makes vibe coding visible and teachable. It watches a live AI coding agent (Claude Code,
Cursor or Codex) and shows it as characters working inside a building. Each room is one part of a
software app. A narrator explains each step in plain language for people who don't code, such as
scientists. When the agent needs the user, their phone pings and a decision card appears, so they don't
have to sit and watch a terminal.

- **Event:** sunhacks 2026 at ASU. Devpost deadline **Sunday Nov 15, 2026, 11:00 AM MST**. We submit at
  **10:30 AM**. Code freeze **9:00 AM**. Feature freeze **8:30 AM**.
- **Judging:** originality, complexity, completeness, design.
- **Team:** 2 people. Aslbek (Claude Code) owns the **Brain**. The friend (Codex, plus ChatGPT Pro for
  images) owns the **World**. Both use Cursor.
- **Closest existing project:** Pixel Agents (github.com/pablodelucca/pixel-agents), a VS Code extension
  for Claude Code only, with no teaching. We differ by supporting 3 agents, teaching, personalization,
  accessibility and remote decisions.

### The user experience in one paragraph

A biologist opens Buildscape, answers 4 onboarding questions (field, coding level, learning style,
accessibility), and gets a **lab**-themed building. They start Claude Code on their project. A Claude
character walks to the "Sample Intake" room (the API), and the narrator says "Claude is building the
window where other programs drop off requests, like the intake desk in your lab." A concept card "What is
an API?" slides in. Later the agent wants to install a library: the phone buzzes, a card explains the
choice in plain words, the user taps Approve, and the agent continues. At the end, a map of the building
shows the big picture of the app and the concepts they learned. Next session, it remembers what they
already know.

## 2. Architecture

```
Claude Code hooks ─┐
Cursor hooks.json ─┼─> brain/ (Node, port 4321) ──WebSocket──> web/ (Vite + Phaser 3)
Codex JSONL+notify ┘     normalize -> narrate -> record           building, characters, cards
                         decisions, ntfy ping, memory             onboarding, themes, a11y
                         replay recorded sessions
```

1. **Adapters** catch raw agent activity.
   - Claude Code: hooks `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop` in
     `.claude/settings.json`. Each runs `brain/hooks/claude-hook.sh`, which pipes stdin JSON to
     `POST /hook/claude`.
   - Cursor: `.cursor/hooks.json` with `beforeShellExecution`, `afterFileEdit`, `stop`, running
     `brain/hooks/cursor-hook.sh`, which posts to `POST /hook/cursor`.
   - Codex: tail `~/.codex/sessions/**/rollout-*.jsonl` with chokidar, and a `notify` script in
     `~/.codex/config.toml` that posts to `POST /hook/codex` when a turn ends.
   - **Payload formats change often. Log every raw payload to `sessions/raw/` and write the mapping from
     real samples, not from memory or docs.**
2. **Normalizer** turns each raw payload into a `BuildEvent` and picks its room (rules in section 4).
3. **Narrator** takes the event and the `UserProfile` and returns 1 to 2 plain sentences plus an optional
   concept id. Claude Haiku by default, Gemini Flash behind `NARRATOR=gemini`. Cache by
   `(kind, room, level, theme, lang)`. If no network or key, use the template narrator.
4. **Recorder** appends every `ServerMsg` sent to the browser (events, narration, concepts, decisions) to
   `sessions/live/<time>-<session>.jsonl`, one `SessionLine` (`{ t, msg }`) per line. **Replayer** streams a
   file back at 1x to 8x and pauses on decision cards until answered. The web app can also play the same
   files by itself with `?fixture=lab-demo` (no brain needed). Copy good recordings into `sessions/golden/`.
   **Replay is the demo safety net and the test harness.**
5. **Decisions:** a `waiting_for_user` event sends an ntfy.sh push and a `decision` message. For Claude
   Code `PreToolUse` and Cursor `beforeShellExecution`, the hook script holds its HTTP request open up to
   60 s waiting for the browser's `decide`, then returns allow or deny. On timeout it returns "ask" so the
   normal terminal prompt takes over. `BUILDSCAPE_NO_WAIT=1` disables waiting entirely.
6. **World** keeps one WebSocket to `ws://localhost:4321/ws` and renders.

## 3. The contract: `shared/events.ts`

Frozen at 9:15 PM. **Do not change it without the other person agreeing first.** Adding an optional field
is OK after a heads-up; renaming or removing is not.

```ts
export type AgentSource = 'claude-code' | 'cursor' | 'codex' | 'replay';
export type Room = 'lobby' | 'screens' | 'api' | 'database' | 'login' | 'tests' | 'setup';
export type EventKind =
  | 'session_start' | 'thinking' | 'file_read' | 'file_edit' | 'shell'
  | 'test_run' | 'waiting_for_user' | 'user_replied' | 'error' | 'done';

export interface BuildEvent {
  id: string;            // ulid
  ts: number;            // ms epoch
  sessionId: string;
  source: AgentSource;
  agentId: string;       // one character per agent or subagent
  kind: EventKind;
  room: Room;
  summary: string;       // raw, e.g. "Edited src/api/users.ts (+24 lines)"
  detail?: { file?: string; command?: string; diffLines?: number;
             exitCode?: number; question?: string; options?: string[] };
}

export interface Narration { eventId: string; text: string; conceptId?: string; }
export interface Concept { id: string; room: Room; title: string; oneLiner: string;
  analogy: Record<ThemeId, string>; }
export interface DecisionCard { id: string; eventId: string; question: string;
  options: { label: string; explain: string }[]; recommended?: number; }

export type ThemeId = 'office' | 'lab' | 'kitchen';
export type Level = 'new' | 'some' | 'dev';
export interface UserProfile { userId: string; field: string; level: Level;
  style: 'visual' | 'reading' | 'listening'; theme: ThemeId;
  a11y: { reducedMotion: boolean; colorSafe: boolean; dyslexiaFont: boolean;
          captions: boolean; voice: boolean; lang: 'en' | 'es' | 'uz' | string }; }

// Server -> browser
export type ServerMsg =
  | { type: 'event'; data: BuildEvent }
  | { type: 'narration'; data: Narration }
  | { type: 'concept'; data: Concept & { seenBefore: boolean } }
  | { type: 'decision'; data: DecisionCard }
  | { type: 'status'; data: { mode: 'live' | 'replay'; sources: AgentSource[] } };

// Browser -> server
export type ClientMsg =
  | { type: 'profile'; data: UserProfile }
  | { type: 'decide'; cardId: string; option: number }
  | { type: 'replay'; file: string; speed: number }
  | { type: 'learned'; conceptId: string };
```

**Message order for one step:** `event` first, then `narration` (may arrive 0.2 to 2 s later), then
optionally `concept`. A `decision` always follows a `waiting_for_user` event with the same `eventId`.
The web app must work if `narration` never arrives.

### REST (brain, port 4321)

| Method and path | Purpose |
| --- | --- |
| `POST /hook/claude`, `/hook/cursor`, `/hook/codex` | Raw adapter input; may hold the response open for a decision |
| `GET /api/sessions` | List recorded `.jsonl` files for the replay picker |
| `GET /api/concepts` | Concept card library (`shared/concepts.json`) |
| `GET /api/memory/:userId` | Concept ids already learned |
| `GET /health` | `{ ok: true, mode, sources }`; web shows a "Brain connected" badge |

## 4. Rooms

| Room id | Office name | Lab name | Kitchen name | What it teaches | Path and command rules |
| --- | --- | --- | --- | --- | --- |
| `lobby` | Lobby | Lab bench | Prep counter | Planning and thinking | thinking, planning, anything unmatched |
| `screens` | Design studio | Microscope room | Plating station | What the user sees (frontend) | `components/`, `pages/`, `app/`, `*.tsx`, `*.jsx`, `*.css`, `*.html`, `*.vue` |
| `api` | Mail room | Sample intake | Order window | How programs talk (API) | `api/`, `routes/`, `server/`, `controllers/` |
| `database` | Archive | Cold storage freezer | Pantry and fridge | Where data lives (database) | `db/`, `prisma/`, `models/`, `migrations/`, `schema.*`, `*.sql` |
| `login` | Security desk | Badge-access door | Staff-only door | Who is allowed in (auth) | `auth`, `login`, `session`, `jwt`, `password` in path |
| `tests` | Quality check | Control experiment | Taste test | Checking it works (tests) | `test/`, `__tests__/`, `*.spec.*`, `*.test.*`, `jest`, `vitest`, `pytest` |
| `setup` | Supply closet | Reagent shelf | Grocery delivery | Tools and settings (dependencies, config) | `package.json`, lockfiles, `.env*`, configs, `npm install`, `pip install` |

Agent colors (also used as character tint): Claude Code `#D97757` orange, Cursor `#3B82F6` blue,
Codex `#10B981` green. In color-safe mode use Okabe-Ito: `#E69F00`, `#0072B2`, `#009E73`, and always
show the agent name label, never color alone.

## 5. Who owns what

### Brain: Aslbek with Claude Code (folder `brain/`, plus `shared/concepts.json`)

| Id | Pri | Task |
| --- | --- | --- |
| A0 | P0 | Repo skeleton, `shared/events.ts`, 3 fixture sessions in `sessions/fixtures/` |
| A1 | P0 | Express + ws server, `/health`, broadcast, recorder, replayer with speed |
| A2 | P0 | Claude Code adapter, hook script, normalizer, room rules; test on `demo-app/` |
| A3 | P0 | Narrator (Haiku), prompts per level and theme, cache, template fallback, 15 concept cards |
| A4 | P0 | `waiting_for_user` detection, decision cards, hook waits on `decide` |
| A5 | P1 | ntfy.sh phone ping with a link back to the card |
| A6 | P1 | Cursor adapter |
| A7 | P1 | Codex adapter |
| A8 | P1 | Gemini narrator switch, Gemini multimodal "explain this screenshot" |
| A9 | P1 | supermemory for learned concepts, JSON fallback, `seenBefore` |
| A10 | P1 | Grok Bot automation: posts a 3-line team digest from the event stream (SpaceXSI) |
| A11 | P0 | Record golden sessions for all 3 agents building a "plant growth tracker" in `demo-app/` |

### World: friend with Codex, Cursor and ChatGPT images (folder `web/`, plus `shared/i18n/`)

| Id | Pri | Task |
| --- | --- | --- |
| B0 | P0 | Vite + TS + Phaser 3 in `web/`, WebSocket client with reconnect, dev mode that loads fixtures from disk |
| B1 | P0 | Building scene: cutaway building, 3 floors. Floor 2: screens, api, database. Floor 1: login, tests, setup. Ground: lobby full width. Room sign (drawn by code, not in the image) + glow when active. Plain colored rooms first, images swapped in later |
| B2 | P0 | Characters per `agentId`, tinted by source, walk to room, action animation, speech bubble with `summary` |
| B3 | P0 | Narrator caption strip, step timeline, concept cards with "Got it" -> `learned` |
| B4 | P0 | Decision card modal: question, options with plain explanations, recommended badge; raised-hand icon on the character |
| B5 | P0 | Onboarding, 4 screens; field picks theme (biology or chemistry -> lab, food or "just for fun" -> kitchen, else office) |
| B6 | P0 | Replay picker, speed control, Live/Replay badge from `status` |
| B7 | P1 | Lab and kitchen themes from ChatGPT images (see `ASSET_PROMPTS.md`). **Build the kitchen theme with Cursor Agent** (needed for SpaceXSI) |
| B8 | P1 | Accessibility: reduced motion, color-safe palette, OpenDyslexic toggle, captions, Web Speech voice, keyboard nav |
| B9 | P1 | i18n: en, es, uz string files; send `lang` in profile |
| B10 | P1 | "What I learned" end screen: room map + collected concepts |
| B11 | P2 | Landing page on the GoDaddy domain, hosted replay demo (Vercel) |

Priorities: **P0 is the MVP and must work by 2:00 AM.** P1 starts only after its lane's P0 is done.
P2 only if everything else is green at 7:30 AM.

## 6. Repo layout

Status: the starter (A0, A1, A2, most of B0 to B6 at a basic level) is built. Look for `TODO(<task id>)` comments.


```text
buildscape/
  AGENTS.md  CLAUDE.md  README.md  .gitignore (.env*, node_modules, sessions/raw)
  shared/   events.ts  concepts.json  i18n/{en,es,uz}.json
  brain/    src/{server,normalize,replay,recorder,memory,notify}.ts
            src/narrator/{haiku,gemini,template,prompts,cache}.ts
            src/adapters/{claude,cursor,codex}.ts
            hooks/{claude-hook.sh,cursor-hook.sh,codex-notify.sh}
            bots/grok-digest.ts
  web/      src/main.ts  src/net/socket.ts
            src/scenes/{Boot,Onboarding,Building,Summary}.ts
            src/ui/{NarratorPanel,DecisionCard,ConceptCard,Settings}.ts
            src/themes/{office,lab,kitchen}/theme.ts
            src/a11y/
            public/assets/{common,office,lab,kitchen}/
  sessions/ fixtures/  golden/  raw/
  demo-app/            tiny app the agents build on camera
  .claude/settings.json  .cursor/hooks.json   example hook configs
  docs/AI_USAGE.md     which AI built what (required by sunhacks)
```

Scripts: `npm run dev` (brain + web), `npm run brain`, `npm run web`,
`npm run replay -- sessions/golden/lab-demo.jsonl`, `npm run hooks:install -- <targetDir>`.

## 7. Rules for every AI agent on this repo

1. **Stay in your lane's folder.** Brain work touches `brain/` and `shared/concepts.json`. World work
   touches `web/` and `shared/i18n/`. Never edit `shared/events.ts` unless the human tells you the other
   person agreed.
2. **Import types from `shared/events.ts`.** Never redefine them locally.
3. **Everything must work in replay mode with no network and no API keys.** Live features are additive.
4. **Small commits, small PRs.** Branch prefixes `brain/*` and `world/*`. `main` must always run
   with `npm run dev`. Pull `main` before starting each task.
5. **No secrets in git.** Keys live in `.env.local` only: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
   `SUPERMEMORY_API_KEY`, `XAI_API_KEY`, `NTFY_TOPIC`.
6. **Plain language is the product.** Any user-facing text (narration, cards, UI) must make sense to a
   biologist who has never coded. No jargon without a one-line explanation.
7. **Accessibility is not optional.** Every animation respects `reducedMotion`. Every color meaning also
   has a label or icon. All buttons work with the keyboard.
8. **Prefer boring, working code over clever code.** It is a 14-hour hackathon. If a task will take more
   than 45 minutes, stop and tell the human.
9. **Log what AI did.** After a meaningful task, append one line to `docs/AI_USAGE.md`:
   `- <tool>: <what it built> (<files>)`.
10. **Assets:** only images we generated ourselves (ChatGPT) or CC0 packs (Kenney.nl). Credit them in
    the README.

## 8. Timeline (MST)

| Time | Aslbek (Brain) | Friend (World) | Checkpoint |
| --- | --- | --- | --- |
| 8:20 to 9:15 PM | Repo, A0, contract | Setup, B0; start ChatGPT image batch 1 | **9:15 contract frozen** |
| 9:15 to 10:30 PM | A1 | B0, B1 | |
| 10:30 to 10:40 PM | Break | Break | |
| 10:40 PM to 12:00 AM | A2, A3 | B2, B3; image batch 2 | **11:00 PM** server replays fixtures |
| 12:00 to 12:25 AM | Food | Food | **12:00 AM** web plays a fixture end to end |
| 12:25 to 2:00 AM | A4, first real recording | B4, B5, B6 | **2:00 AM MVP live** |
| 2:00 to 5:00 AM | Sleep | B7 (kitchen in Cursor), B8; break 3:30 | |
| 5:00 to 5:15 AM | Sync | Handoff note, push | main green |
| 5:15 to 8:00 AM | A5 to A11; break 6:45 | Sleep | **7:30 AM** all 3 agents in the World |
| 8:00 to 9:00 AM | Bug bash | B9, B10, bug bash | **8:30 feature freeze**, test with a non-coder |
| 9:00 to 9:15 AM | Code freeze, tag v1.0, deploy | Test on 2nd laptop and phone | |
| 9:15 to 10:20 AM | Devpost text, README, AI_USAGE | Record and edit video, upload | |
| 10:20 to 10:30 AM | **Submit** | Check form | |

## 9. Demo themes

The demo shows **lab** (biologist persona) and **kitchen** (home cook persona). The office theme can be
plain colored rooms with labels; it is the fallback, not a demo star.

## 10. Sponsor tracks (features must be real and visible)

- **Gemini:** narrator provider switch + screenshot explanation (A8).
- **SpaceXSI:** Cursor is a core agent, both visualized (A6) and used to build the kitchen theme (B7).
  Grok Bot automation posts team digests (A10).
- **supermemory:** learned concepts persist; second session shows "you learned this before" (A9).
- **GoDaddy:** domain for the landing page (B11).
- Also: Best Overall, Gaming, JFF Future of Work, Diversity.
