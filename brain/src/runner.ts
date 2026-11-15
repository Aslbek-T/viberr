import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { CLAUDE_BIN, CLAUDE_MODEL, PORT, PROJECTS_DIR, ROOT } from './config.ts';
import { isInstall, RISKY_CMD, TEST_CMD, type Raw } from './stages.ts';
import { story } from './story.ts';
import { translateFinish, translatePlan } from './translator.ts';

// Starts Claude Code for the person and listens to what it does.
// Two channels: hooks (every tool call, and the only way to pause the agent for a question)
// and the stream-json output (the agent's own words and the final result).

const RULES = `You are building a small app for a person who does not code. They never see code or this
conversation: a separate guide explains your work to them. Follow these rules.
1. FIRST write PLAN.md, the real and complete plan, in everyday words a non-coder understands (no file names,
   no code, no tool names; if you need a real term like "frontend" or "database", explain it in the same line).
   Use EXACTLY this layout:
   # <a friendly name for the app>
   <one sentence: what the app is and who it is for>
   ## What you will be able to do
   (3 to 6 bullets, every feature)
   ## The screens
   (one bullet per screen or area of the page: what is on it)
   ## What happens when you tap
   (one bullet per rule, like "Tapping Add puts the chore on the list with its points")
   ## What it remembers
   (what information is kept, and that it is still there after closing the page)
   ## How I will check it works
   (the automatic checks you will write, in plain words)
   ## The parts I will build
   (one bullet per part, starting with its district: "Toolbox:", "Screens:", "Rules:", "Memory:" or "Checks:",
   then a 2 or 3 word name and what it does, e.g. "Rules: Point counter - adds up each person's points")
2. Then build the smallest version that works, as a web page that opens straight from index.html with no
   server and no build step, unless they clearly ask for something else. Create the files in EXACTLY this
   order, one after the other, finishing each before starting the next:
   a) package.json (a name, a description and a "test" script that runs "node tests.js")
   b) index.html, then styles.css: everything people see. Make it look polished and friendly.
   c) app.js: the logic, as small well-named functions (for example addPlant, calculateGrowth)
   d) storage.js: saving and loading the information in the browser (for example savePlants, loadPlants)
   e) tests.js: a few simple checks of the logic, each with a plain-English name, that run with "node tests.js"
3. Run the checks once and fix any problem.
4. LAST, write PROJECT_GUIDE.md for a developer who joins later: what the app does, how to open it and run the
   checks, every file and what it is responsible for, how the parts talk to each other (screen -> rules -> memory),
   where the information is stored and in what shape, and 3 good next steps. Keep it short and concrete.
5. Do not ask questions; make sensible choices. Do not start servers or long-running commands.
   Do not install packages unless truly needed. Stay inside the current folder.
6. Finish with 2 or 3 friendly sentences on what the app does and how to use it, with no technical words.`;

const CHANGE_RULES = `The person who owns this app does not code and asks for a change. Make the change in the
existing files, keep the app opening straight from index.html, update tests.js if the logic changed, run
"node tests.js" once, update PROJECT_GUIDE.md so it still matches the app, and finish with 1 or 2 friendly
sentences on what changed, with no technical words.
Do not ask questions. Do not start servers. Stay inside the current folder.`;

interface Run {
  idea: string; dir: string; slug: string; fresh: boolean; child?: ChildProcess;
  planText?: string; planGate?: Promise<boolean>; planApproved: boolean; stopped: boolean; result?: { text: string; error: boolean };
}

const allow = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: reason } });
const deny = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

class Runner {
  run?: Run;
  get dir() { return this.run?.dir; }

  private slug(idea: string) {
    const words = idea.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join('-') || 'app';
    return `${words}-${Date.now().toString(36).slice(-4)}`;
  }

  /** Starts a new project, or (with `change`) continues the last one. */
  start(idea: string, change = false): { ok: boolean; error?: string } {
    if (story.state.running) return { ok: false, error: 'The builder is already working.' };
    const previous = this.run;
    const fresh = !(change && previous);
    const slug = fresh ? this.slug(idea) : previous!.slug;
    const dir = fresh ? path.join(PROJECTS_DIR, slug) : previous!.dir;
    this.installHooks(dir);
    const run: Run = { idea, dir, slug, fresh, planApproved: !fresh, stopped: false };
    this.run = run;
    story.start(idea, slug, fresh);

    const args = ['-p', idea, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--append-system-prompt', fresh ? RULES : CHANGE_RULES];
    if (!fresh) args.push('--continue');
    if (CLAUDE_MODEL) args.push('--model', CLAUDE_MODEL);
    args.push('--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite');

    console.log(`[run] ${fresh ? 'new project' : 'change'} in ${dir}`);
    const child = spawn(CLAUDE_BIN, args, {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BUILDSCAPE_URL: `http://127.0.0.1:${PORT}` },
    });
    run.child = child;
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr = (stderr + String(d)).slice(-2000); });
    readline.createInterface({ input: child.stdout! }).on('line', (line) => this.onStreamLine(run, line));
    child.on('error', (err) => {
      console.error('[run] could not start Claude Code:', err.message);
      void story.finish({ ok: false, summary: 'The builder could not start. Make sure Claude Code is installed and that running "claude" in a terminal works, then try again.' });
    });
    child.on('close', (code) => void this.onClose(run, code, stderr));
    return { ok: true };
  }

  stop() {
    if (!this.run?.child || !story.state.running) return;
    this.run.stopped = true;
    this.run.child.kill('SIGTERM');
  }

  private installHooks(dir: string) {
    const file = path.join(dir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const cmd = { type: 'command', command: `node ${JSON.stringify(path.join(ROOT, 'brain/hooks/claude-hook.mjs'))}`, timeout: 600 };
    const settings = { hooks: { PreToolUse: [{ matcher: '*', hooks: [cmd] }], PostToolUse: [{ matcher: 'Bash', hooks: [cmd] }], PostToolUseFailure: [{ matcher: 'Bash', hooks: [cmd] }] } };
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  }

  private onStreamLine(run: Run, line: string) {
    let m: any;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'assistant') {
      for (const part of m.message?.content ?? []) {
        if (part.type === 'text' && part.text?.trim()) story.raw({ kind: 'note', text: part.text.trim() });
      }
    } else if (m.type === 'result') {
      run.result = { text: String(m.result ?? ''), error: !!m.is_error };
    }
  }

  private async onClose(run: Run, code: number | null, stderr: string) {
    const ok = code === 0 && !run.result?.error && !run.stopped;
    console.log(`[run] finished (exit ${code}, ok=${ok})`);
    if (!ok && !run.stopped) console.error('[run] ' + (run.result?.text || stderr || 'no output').slice(0, 600));
    const hasPage = fs.existsSync(path.join(run.dir, 'index.html'));
    const hasGuide = fs.existsSync(path.join(run.dir, 'PROJECT_GUIDE.md'));
    let summary: string;
    if (run.stopped) summary = 'You stopped the builder. Nothing more was changed. Describe what you would like instead and start again.';
    else if (!ok) summary = 'The builder ran into a problem and stopped. Check the terminal where Buildscape is running for details, then try again.';
    else summary = await translateFinish(run.idea, run.result?.text ?? '', story.state.tasks.map((t) => t.text), true, !run.fresh);
    const v = Date.now().toString(36);
    await story.finish({ ok, summary, previewUrl: ok && hasPage ? `/preview/index.html?v=${v}` : undefined,
      handoffUrl: ok && hasGuide ? `/handoff?v=${v}` : undefined });
  }

  // ---------------------------------------------------------------- hooks

  /** Handles one Claude Code hook call. The answer can allow or block the step. */
  async onHook(p: any): Promise<object> {
    const run = this.run;
    if (process.env.BUILDSCAPE_DEBUG) fs.appendFileSync(path.join(ROOT, 'runs', 'hooks-debug.jsonl'), JSON.stringify(p).slice(0, 4000) + '\n');
    if (!run || !story.state.running || (p.cwd && path.resolve(p.cwd) !== path.resolve(run.dir))) return {};
    const input = p.tool_input ?? {};
    const abs: string | undefined = input.file_path ?? input.path;
    const file = abs ? path.relative(run.dir, abs) : undefined;

    // After a command: a failed one is a problem the builder will fix, a passed check is good news.
    if (p.hook_event_name === 'PostToolUseFailure') {
      story.raw({ kind: 'problem', command: String(input.command ?? ''), text: String(p.error ?? '').slice(0, 300) });
      return {};
    }
    if (p.hook_event_name === 'PostToolUse') {
      if (TEST_CMD.test(String(input.command ?? ''))) story.raw({ kind: 'pass' });
      return {};
    }
    if (p.hook_event_name !== 'PreToolUse') return {};

    let raw: Raw;
    switch (p.tool_name) {
      case 'Read': case 'Glob': case 'Grep': case 'LS': raw = { kind: 'read', file }; break;
      case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
        raw = { kind: 'write', file, snippet: String(input.content ?? input.new_string ?? '').slice(0, 6000) }; break;
      case 'Bash': raw = { kind: 'run', command: String(input.command ?? '').slice(0, 300) }; break;
      default: raw = { kind: 'think', text: p.tool_name };
    }

    const isPlanFile = raw.kind === 'write' && /(^|\/)plan\.md$/i.test(file ?? '');
    if (isPlanFile) run.planText = String(input.content ?? '');

    // 1. The plan: before the first real building step, show the plan and wait for a go-ahead.
    if (!run.planApproved && !isPlanFile && (raw.kind === 'write' || raw.kind === 'run')) {
      if (!run.planText) run.planApproved = true; // the agent skipped the plan; nothing to approve
      else {
        run.planGate ??= this.askPlan(run);
        if (!(await run.planGate)) {
          return deny('The person looked at the plan and chose not to build it yet. Stop now. Do not create or change any files. Reply with one friendly sentence saying you stopped.');
        }
      }
    }

    // 2. Risky commands: ask in plain words.
    if (raw.kind === 'run' && RISKY_CMD.test(raw.command ?? '')) {
      const install = isInstall(raw.command ?? '');
      const choice = await story.ask(install ? {
        question: 'Your builder wants to bring in ready-made parts that other people built. OK?',
        details: ['Most apps are built this way, like buying windows instead of making glass.', 'The parts are downloaded into your project only.'],
        options: [{ label: 'Yes, go ahead', explain: 'The builder downloads the parts and keeps working.' }, { label: 'No, do without', explain: 'The builder will try to make it without them.' }],
        recommended: 0,
      } : {
        question: 'Your builder wants to do something that is hard to undo. Allow it?',
        details: ['It may delete things or change something outside this project.'],
        options: [{ label: 'Allow', explain: 'The builder does it and keeps working.' }, { label: 'Don’t allow', explain: 'The builder skips this and finds another way.' }],
        recommended: 1,
      });
      if (choice !== 0) return deny('The person did not allow this step. Find another way or skip it, and keep going.');
      story.raw(raw);
      return allow('Approved in Buildscape');
    }

    story.raw(raw);
    return {};
  }

  private async askPlan(run: Run): Promise<boolean> {
    await story.flushNow(); // put the planning work into words before asking
    const plan = await translatePlan(run.idea, run.planText ?? '');
    const choice = await story.ask({
      question: plan.title ? `Here is the plan for "${plan.title}". Shall I start building?` : 'Here is the plan for your app. Shall I start building?',
      summary: plan.summary || undefined,
      sections: plan.sections,
      options: [
        { label: 'Yes, build it', explain: 'The builder fills the toolbox, then places the blocks district by district.' },
        { label: 'Not yet', explain: 'The builder stops so you can describe your idea differently.' },
      ],
      recommended: 0,
    });
    run.planApproved = choice === 0;
    if (choice === 0) story.task('plan', 'You approved the plan');
    if (choice !== 0) run.stopped = true;
    return run.planApproved;
  }
}

export const runner = new Runner();
