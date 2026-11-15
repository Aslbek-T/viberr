# AI usage

sunhacks asks teams to credit AI use. One line per meaningful piece of work: `- <tool>: <what> (<files>)`.

- Claude (Claude Code, in a Claude project): planning doc, AGENTS.md, task split and timeline (docs/)
- Claude (Claude Code): starter monorepo, shared contract, brain server, Claude Code adapter, recorder and replayer, template narrator, fixtures, basic web app with building scene, captions, cards and onboarding (shared/, brain/, web/)
- Claude Code: procedural furniture for lab, kitchen and office, animated robot with poses, per-room build stats (web/src/scenes/furniture.ts, robot.ts, web/src/session.ts)
- Claude (in a Claude project): wired furniture, robots, ladder shaft, room build meters, hover tips, ambient particles and day/night sky into the building; moved concept cards to the sidebar (web/src/scenes/Building.ts, web/index.html)
- Claude (in a Claude project): rebuilt the product as a simple wrapper. The brain now starts Claude Code itself, sorts each step into 7 house stages and pauses the builder for a plan approval (brain/src/runner.ts, stages.ts, story.ts, server.ts, brain/hooks/claude-hook.mjs, shared/story.ts)
- Claude (in a Claude project): the guide that rewrites raw agent steps into plain words, using Gemini with built-in sentences as fallback (brain/src/translator.ts)
- Claude (in a Claude project): new web app with one window per stage, SVG scenes, builder questions, sounds and a recorded demo (web/src/, web/public/)
- Claude Code: is the builder inside the product, and built the demo app in web/public/demo-app/ during a recorded run
- Gemini (optional, free tier): writes the plain-language explanations at run time
- Ideas for the builder character, stages and color mood came from our teammate's prototype built with Codex: https://github.com/DevBehruz/vibeerr
- Claude (in a Claude project): block-site redesign with walking builder, one chat box that routes questions vs builds, full plain-language plan card, structure summary and developer handoff (web/src/world.ts, web/src/main.ts, brain/src/router.ts, brain/src/runner.ts, brain/src/story.ts, brain/src/translator.ts, shared/story.ts, scripts/make-demo.mjs)
- Cursor (Grok): plain-language stages, editable short plan, longer prompt box, notes while a build runs, stop and start over, folder plus Claude/Cursor/Codex choice, and a VIBEERR.md brief so those AIs can take turns (shared/story.ts, web/src/main.ts, web/src/styles.css, brain/src/runner.ts, brain/src/agents.ts, brain/src/brief.ts, brain/src/translator.ts)
- Cursor (Grok): Gemini guide falls through overloaded and retired model ids to one that still answers (brain/src/translator.ts)
- Cursor (Grok): landing page leads with the prompt, and choosing a folder opens the person's own folders (web/src/main.ts, web/src/styles.css, brain/src/server.ts)
- Cursor (Grok): the Cursor choice finds the installed agent command and runs it in the project folder (brain/src/agents.ts, brain/src/runner.ts)
- Cursor (Grok): older chat stays in a small strip beside the prompt, and the developer guide still opens after a later change (web/src/main.ts, web/src/styles.css, brain/src/brief.ts, brain/src/runner.ts, brain/src/server.ts)
