import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { AgentId } from '../../shared/story.ts';
import { resolveAgent } from './agents.ts';
import { codexArgs, parseCodexLine } from './codex.ts';
import { ensureGuide, planMarkdown, writeBrief } from './brief.ts';
import { CLAUDE_MODEL, PORT, ROOT } from './config.ts';
import { isInstall, RISKY_CMD, TEST_CMD, type Raw } from './stages.ts';
import { story } from './story.ts';
import { translateFinish, translatePlan } from './translator.ts';

// Starts the AI the person already has (Claude, Cursor, or Codex) and listens to what it does.
// Claude can be paused on a plan. Cursor and Codex write the plan, stop, and wait for the edited version.
// VIBEERR.md is rewritten as the work changes so a different AI can continue.

const PLAN_SHAPE = `Use EXACTLY this layout, in everyday words a scientist understands. No file names, no code, no tool names:
# <a friendly name for the app>
<one sentence: what the app is and who it is for>
## What you can do
(3 to 6 bullets the person can agree with or change)
## What you will see
(one bullet per page or area: what is on it)
## What happens when you use it
(one bullet per action, like "Adding a reading puts it on today's list")
## What it keeps
(what information is still there after the page is closed)
Do not add sections about files, tools, or checks.`;

const RULES = `You are building a small app for a person who does not code. They never see code or this
conversation: a separate guide explains your work to them. Follow these rules.
1. FIRST write PLAN.md. ${PLAN_SHAPE}
2. Then build the smallest version that works, as a web page that opens straight from index.html with no
   server and no build step, unless they clearly ask for something else. Create the files in this order:
   a) package.json (a name, a description, and a "test" script that runs "node tests.js")
   b) index.html, then styles.css: everything people see. Make it look polished and friendly.
   c) app.js: the actions, as small well-named functions
   d) storage.js: saving and loading, so information is still there tomorrow
   e) tests.js: a few simple checks of the actions, each with a plain-English name, that run with "node tests.js"
3. Run the checks once and fix any problem.
4. LAST, write PROJECT_GUIDE.md for a developer who joins later: what the app does, how to open it and run the
   checks, every file and what it is responsible for, how the parts talk to each other, where information is
   stored, and 3 good next steps. Keep it short.
5. Do not ask questions; make sensible choices. Do not start servers or long-running commands.
   Do not install packages unless truly needed. Stay inside the current folder. Do not delete VIBEERR.md.
6. Before each file, re-read VIBEERR.md and follow any notes the person added.
7. Finish with 2 or 3 friendly sentences on what the app does and how to use it, with no technical words.`;

const PLAN_RULES = `You are planning a small app for a person who does not code. Write only PLAN.md, then stop.
Do not create any other file. Do not delete VIBEERR.md. If VIBEERR.md exists, read it first.
${PLAN_SHAPE}`;

const CHANGE_RULES = `The person who owns this app does not code and asks for a change. Read VIBEERR.md and PLAN.md first.
Make the change in the existing files, keep the app opening straight from index.html, update tests.js if an
action changed, run "node tests.js" once, update PROJECT_GUIDE.md so it still matches the app, and finish with
1 or 2 friendly sentences on what changed, with no technical words.
Do not ask questions. Do not start servers. Stay inside the current folder. Do not delete VIBEERR.md.`;

interface Run {
  idea: string;
  dir: string;
  slug: string;
  fresh: boolean;
  agent: AgentId;
  bin: string;
  phase: 'plan' | 'build';
  resume: boolean;
  child?: ChildProcess;
  planText?: string;
  editedPlan?: string;
  planGate?: Promise<boolean>;
  planApproved: boolean;
  stopped: boolean;
  result?: { text: string; error: boolean };
}

const deny = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

class Runner {
  run?: Run;
  private switching: AgentId | null = null;
  private nextBin = '';
  private generation = 0;
  private watcher?: fs.FSWatcher;
  private seen = new Map<string, number>();

  get dir() { return this.run?.dir; }

  /** Starts a new project, or (with `change`) continues the last one. */
  async start(idea: string, opts?: { change?: boolean; folder?: string; agent?: AgentId }): Promise<{ ok: boolean; error?: string }> {
    if (story.state.running) return { ok: false, error: 'The builder is already working. Send a note, or press Stop.' };
    const previous = this.run;
    const fresh = !(opts?.change && previous);
    const agent = opts?.agent && opts.agent !== previous?.agent ? opts.agent : (opts?.agent ?? previous?.agent ?? 'claude');
    const found = await resolveAgent(agent);
    if (!found.ready || !found.bin) return { ok: false, error: found.detail };

    let dir: string;
    if (fresh) {
      const folder = resolveFolder(opts?.folder);
      if (!folder.ok) return folder;
      dir = folder.dir;
    } else dir = previous!.dir;

    const slug = path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';
    const run: Run = {
      idea, dir, slug, fresh, agent, bin: found.bin,
      phase: fresh && agent !== 'claude' ? 'plan' : 'build',
      resume: !fresh && agent === 'claude' && previous?.agent === 'claude',
      planApproved: !fresh, stopped: false,
    };
    this.run = run;
    this.switching = null;
    story.start(idea, `${slug}-${Date.now().toString(36).slice(-4)}`, fresh, { agent, folder: dir });
    this.writeBrief();
    this.launch(run, run.phase === 'plan' ? 'plan' : 'build');
    return { ok: true };
  }

  /** A recommendation typed while the builder is working. The next step is asked to follow it. */
  addNote(text: string): { ok: boolean; error?: string } {
    if (!this.run || !story.state.running) return { ok: false, error: 'Start a build before sending a note.' };
    story.note(text);
    return { ok: true };
  }

  /** Saves the brief, stops the current builder, and continues with a different one. */
  async switchTo(agent: AgentId): Promise<{ ok: boolean; error?: string }> {
    const found = await resolveAgent(agent);
    if (!found.ready || !found.bin) return { ok: false, error: found.detail };
    const run = this.run;
    if (!run) return { ok: true };
    this.writeBrief();
    if (!story.state.running) {
      run.agent = agent;
      run.bin = found.bin;
      story.setAgent(agent);
      return { ok: true };
    }
    if (run.agent === agent) return { ok: true };
    story.say(`Saving a project brief so ${found.label} can continue.`);
    story.cancelAsk();
    const alive = !!run.child && run.child.exitCode === null && !run.child.killed;
    if (!alive) {
      run.agent = agent;
      run.bin = found.bin;
      run.resume = false;
      run.stopped = false;
      story.setAgent(agent);
      this.launch(run, 'continue');
      return { ok: true };
    }
    this.switching = agent;
    this.nextBin = found.bin;
    run.child?.kill('SIGTERM');
    return { ok: true };
  }

  stop() {
    if (!this.run?.child || !story.state.running) return;
    this.run.stopped = true;
    this.switching = null;
    this.run.child.kill('SIGTERM');
  }

  /** Stops everything and returns the screen to the beginning. */
  reset() {
    this.switching = null;
    const child = this.run?.child;
    this.watcher?.close();
    this.watcher = undefined;
    this.generation++;
    this.run = undefined;
    if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
    story.reset();
  }

  writeBrief() {
    const run = this.run;
    if (!run) return;
    writeBrief(run.dir, {
      idea: run.idea, folder: run.dir, agent: run.agent,
      plan: run.editedPlan || run.planText, planApproved: run.planApproved,
      tasks: story.state.tasks.map((task) => task.text),
      parts: story.state.blocks.map((block) => ({ name: block.name, does: block.does })),
      notes: story.state.notes,
    });
  }

  // ---------------------------------------------------------------- process

  private launch(run: Run, kind: 'plan' | 'build' | 'continue') {
    const generation = ++this.generation;
    run.result = undefined;
    const prompt = this.promptFor(run, kind);
    if (run.agent === 'claude') this.installHooks(run.dir);
    const args = this.argsFor(run, kind, prompt);
    console.log(`[run] ${run.agent} ${kind} in ${run.dir}`);
    const child = spawn(run.bin, args, {
      cwd: run.dir, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), '.local/bin')}${path.delimiter}${process.env.PATH ?? ''}`,
        VIBEERR_URL: `http://127.0.0.1:${PORT}`,
        BUILDSCAPE_URL: `http://127.0.0.1:${PORT}`,
      },
    });
    run.child = child;
    if (run.agent === 'claude') this.watcher?.close();
    else this.armWatch(run.dir);
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr = (stderr + String(d)).slice(-2000); });
    if ((run.agent === 'claude' || run.agent === 'codex') && child.stdout) {
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        if (generation !== this.generation) return;
        if (run.agent === 'codex') {
          const event = parseCodexLine(line);
          for (const step of event.steps) story.raw(step);
          if (event.result && !run.result?.error) run.result = event.result;
        } else this.onStreamLine(run, line);
      });
    }
    child.on('error', (err) => {
      if (generation !== this.generation) return;
      console.error('[run] could not start:', err.message);
      void story.finish({ ok: false, summary: `${this.label(run.agent)} could not start. Make sure it is installed and signed in, then try again.` });
    });
    child.on('close', (code) => {
      if (generation !== this.generation) return;
      void this.onClose(run, code, stderr);
    });
  }

  private argsFor(run: Run, kind: 'plan' | 'build' | 'continue', prompt: string) {
    if (run.agent === 'codex') {
      return codexArgs(run.dir, prompt);
    }
    // `--print` is the script mode. The prompt is a separate argument, not the value of -p.
    if (run.agent === 'cursor') {
      return ['--print', '--force', '--trust', '--output-format', 'text', '--workspace', run.dir, prompt];
    }
    const planning = kind === 'plan' || (kind === 'continue' && !run.planApproved);
    const system = planning ? PLAN_RULES : run.resume ? CHANGE_RULES : RULES;
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--append-system-prompt', system];
    if (run.resume) args.push('--continue');
    if (CLAUDE_MODEL) args.push('--model', CLAUDE_MODEL);
    args.push('--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite');
    return args;
  }

  private promptFor(run: Run, kind: 'plan' | 'build' | 'continue') {
    if (!run.fresh && kind === 'build') {
      if (run.agent === 'claude' && run.resume) return run.idea;
      return `The person wants this change:\n${run.idea}\n\n${CHANGE_RULES}`;
    }
    if (kind === 'plan' || (kind === 'continue' && !run.planApproved)) {
      return `The person asked for this:\n${run.idea}\n\nWrite only PLAN.md, then stop.\n${PLAN_SHAPE}\nIf VIBEERR.md exists, read it first. Do not delete it.`;
    }
    if (kind === 'continue') {
      return `Read VIBEERR.md and PLAN.md. Continue that project from the brief. Keep PROJECT_GUIDE.md up to date for a developer. Do not start over and do not delete VIBEERR.md or PROJECT_GUIDE.md.\nThe person originally asked for:\n${run.idea}`;
    }
    if (run.agent === 'claude') return run.idea;
    return `The person asked for this:\n${run.idea}\n\nRead PLAN.md and follow it exactly, including their edits. Re-read VIBEERR.md before each file and follow any new notes. Do not delete VIBEERR.md.\n${RULES}`;
  }

  private async onClose(run: Run, code: number | null, stderr: string) {
    if (this.run !== run) return;
    this.watcher?.close();
    this.watcher = undefined;
    if (this.switching) {
      const next = this.switching;
      const bin = this.nextBin;
      this.switching = null;
      this.nextBin = '';
      run.stopped = false;
      run.agent = next;
      if (bin) run.bin = bin;
      run.resume = false;
      story.setAgent(next);
      this.launch(run, 'continue');
      return;
    }
    if (run.phase === 'plan' && !run.stopped) {
      if (code !== 0 || run.result?.error) {
        await this.finishRun(run, code, stderr);
        return;
      }
      run.planText = this.readPlan(run) || run.planText;
      if (!run.planText?.trim()) {
        await story.finish({ ok: false, summary: `${this.label(run.agent)} stopped before writing a plan. Try again, or pick a different AI.` });
        return;
      }
      const generation = this.generation;
      const ok = await this.askPlan(run);
      if (generation !== this.generation || this.run !== run) return;
      if (!ok) {
        await story.finish({ ok: false, summary: 'You stopped before the build. Change the idea and start again when you are ready.' });
        return;
      }
      run.phase = 'build';
      this.launch(run, 'build');
      return;
    }
    await this.finishRun(run, code, stderr);
  }

  private async finishRun(run: Run, code: number | null, stderr: string) {
    const ok = code === 0 && !run.result?.error && !run.stopped;
    console.log(`[run] finished (exit ${code}, ok=${ok})`);
    if (!ok && !run.stopped) console.error('[run] ' + (run.result?.text || stderr || 'no output').slice(0, 600));
    const hasPage = fs.existsSync(path.join(run.dir, 'index.html'));
    let summary: string;
    if (run.stopped) summary = 'You stopped the builder. Nothing more was changed. You can send a new note or start over.';
    else if (!ok) summary = `The builder ran into a problem and stopped. Check the terminal where Vibeerr is running, then try again or switch AI.`;
    else summary = await translateFinish(run.idea, run.result?.text ?? '', story.state.tasks.map((task) => task.text), true, !run.fresh);
    this.writeBrief();
    if (hasPage && this.run) {
      ensureGuide(run.dir, {
        idea: run.idea, folder: run.dir, agent: run.agent,
        plan: run.editedPlan || run.planText, planApproved: run.planApproved,
        tasks: story.state.tasks.map((task) => task.text),
        parts: story.state.blocks.map((block) => ({ name: block.name, does: block.does })),
        notes: story.state.notes,
      });
    }
    const guideReady = fs.existsSync(path.join(run.dir, 'PROJECT_GUIDE.md'));
    const stamp = Date.now().toString(36);
    await story.finish({
      ok, summary,
      previewUrl: ok && hasPage ? `/preview/index.html?v=${stamp}` : undefined,
      handoffUrl: guideReady ? `/handoff?v=${stamp}` : undefined,
    });
  }

  private readPlan(run: Run) {
    try { return fs.readFileSync(path.join(run.dir, 'PLAN.md'), 'utf8'); } catch { return ''; }
  }

  private installHooks(dir: string) {
    const file = path.join(dir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const cmd = { type: 'command', command: `node ${JSON.stringify(path.join(ROOT, 'brain/hooks/claude-hook.mjs'))}`, timeout: 600 };
    const settings = { hooks: { PreToolUse: [{ matcher: '*', hooks: [cmd] }], PostToolUse: [{ matcher: 'Bash', hooks: [cmd] }], PostToolUseFailure: [{ matcher: 'Bash', hooks: [cmd] }] } };
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  }

  private armWatch(dir: string) {
    this.watcher?.close();
    this.seen.clear();
    try {
      this.watcher = fs.watch(dir, { recursive: true }, (_event, name) => {
        const rel = String(name ?? '').replaceAll('\\', '/');
        const current = this.run;
        if (!rel || !current || current.agent === 'claude' || !story.state.running) return;
        if (/(^|\/)(node_modules|\.git|\.claude)(\/|$)|vibeerr\.md$/i.test(rel)) return;
        if (/(^|\/)plan\.md$/i.test(rel)) {
          try { current.planText = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { /* still being written */ }
          return;
        }
        if (!current.planApproved) return;
        const now = Date.now();
        if (now - (this.seen.get(rel) ?? 0) < 700) return;
        this.seen.set(rel, now);
        story.raw({ kind: 'write', file: rel });
      });
    } catch (err) {
      console.error('[run] could not watch the folder', err);
    }
  }

  private onStreamLine(run: Run, line: string) {
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (message.type === 'assistant') {
      for (const part of message.message?.content ?? []) {
        if (part.type === 'text' && part.text?.trim()) story.raw({ kind: 'note', text: part.text.trim() });
      }
    } else if (message.type === 'result') {
      run.result = { text: String(message.result ?? ''), error: !!message.is_error };
    }
  }

  // ---------------------------------------------------------------- hooks

  /** Handles one Claude Code hook call. The answer can allow or block the step. */
  async onHook(body: any): Promise<object> {
    const run = this.run;
    if (process.env.VIBEERR_DEBUG || process.env.BUILDSCAPE_DEBUG) fs.appendFileSync(path.join(ROOT, 'runs', 'hooks-debug.jsonl'), JSON.stringify(body).slice(0, 4000) + '\n');
    if (!run || !story.state.running || (body.cwd && path.resolve(body.cwd) !== path.resolve(run.dir))) return {};
    const input = body.tool_input ?? {};
    const abs: string | undefined = input.file_path ?? input.path;
    const file = abs ? path.relative(run.dir, abs) : undefined;

    if (body.hook_event_name === 'PostToolUseFailure') {
      story.raw({ kind: 'problem', command: String(input.command ?? ''), text: String(body.error ?? '').slice(0, 300) });
      return {};
    }
    if (body.hook_event_name === 'PostToolUse') {
      if (TEST_CMD.test(String(input.command ?? ''))) story.raw({ kind: 'pass' });
      return {};
    }
    if (body.hook_event_name !== 'PreToolUse') return {};

    let raw: Raw;
    switch (body.tool_name) {
      case 'Read': case 'Glob': case 'Grep': case 'LS': raw = { kind: 'read', file }; break;
      case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
        raw = { kind: 'write', file, snippet: String(input.content ?? input.new_string ?? '').slice(0, 6000) }; break;
      case 'Bash': raw = { kind: 'run', command: String(input.command ?? '').slice(0, 300) }; break;
      default: raw = { kind: 'think', text: body.tool_name };
    }

    const isPlanFile = raw.kind === 'write' && /(^|\/)plan\.md$/i.test(file ?? '');
    if (isPlanFile) run.planText = String(input.content ?? '');

    if (!run.planApproved && !isPlanFile && (raw.kind === 'write' || raw.kind === 'run')) {
      if (!run.planText) run.planApproved = true;
      else if (!(await this.askPlan(run))) {
        if (this.switching || this.run !== run) return {};
        return deny('The person looked at the plan and chose not to build it yet. Stop now. Do not create or change any files. Reply with one friendly sentence saying you stopped.');
      }
    }

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
      if (choice.option !== 0) return deny('The person did not allow this step. Find another way or skip it, and keep going.');
      story.raw(raw);
      return this.hookOk('Approved in Vibeerr');
    }

    story.raw(raw);
    return this.hookOk(isPlanFile ? 'The plan can be written' : 'Approved in Vibeerr');
  }

  private async askPlan(run: Run): Promise<boolean> {
    if (run.planGate) return run.planGate;
    run.planGate = this.askPlanOnce(run);
    return run.planGate;
  }

  private async askPlanOnce(run: Run): Promise<boolean> {
    await story.flushNow();
    const generation = this.generation;
    const plan = await translatePlan(run.idea, run.planText ?? '');
    const choice = await story.ask({
      question: plan.title ? `Here is the plan for "${plan.title}". Change any line, then start the build.` : 'Here is the plan. Change any line, then start the build.',
      summary: plan.summary || undefined,
      sections: plan.sections,
      editable: true,
      options: [
        { label: 'Build this', explain: 'The builder follows the words in these boxes.' },
        { label: 'Not yet', explain: 'Stop, so you can describe the idea differently.' },
      ],
      recommended: 0,
    });
    if (generation !== this.generation || this.run !== run || this.switching) return false;
    if (choice.option !== 0) {
      run.stopped = true;
      return false;
    }
    const sections = choice.plan?.length ? choice.plan : plan.sections;
    const summary = choice.summary?.trim() || plan.summary;
    const markdown = planMarkdown(plan.title || 'Your app', summary, sections);
    fs.writeFileSync(path.join(run.dir, 'PLAN.md'), markdown);
    run.planText = markdown;
    run.editedPlan = markdown;
    run.planApproved = true;
    this.writeBrief();
    story.task('plan', 'You approved the plan');
    return true;
  }

  private hookOk(reason: string) {
    const extra = [
      this.run?.editedPlan ? `The person edited the plan. Build exactly this and drop anything they removed:\n${this.run.editedPlan}` : '',
      story.state.notes.length ? `Notes from the person. Follow them on this step:\n${story.state.notes.map((note) => `- ${note}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    const hookSpecificOutput: Record<string, string> = { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: reason };
    if (extra) hookSpecificOutput.additionalContext = extra.slice(0, 8000);
    return { hookSpecificOutput };
  }

  private label(agent: AgentId) {
    return agent === 'claude' ? 'Claude' : agent === 'cursor' ? 'Cursor' : 'Codex';
  }
}

/** Turns a typed folder into a real directory inside the home folder. */
export function resolveFolder(input: string | undefined): { ok: true; dir: string } | { ok: false; error: string } {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, error: 'Add a folder so the builder knows where to put the app.' };
  if (raw.includes('\0')) return { ok: false, error: 'That folder name cannot be used.' };
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw === '~' ? os.homedir() : raw;
  const dir = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(os.homedir(), 'Vibeerr', expanded);
  const home = os.homedir();
  if (dir === home || dir === path.parse(dir).root) return { ok: false, error: 'Pick a folder for this one project, not your whole home folder.' };
  if (!dir.startsWith(home + path.sep)) return { ok: false, error: 'Pick a folder inside your home folder.' };
  if (dir === ROOT || dir.startsWith(ROOT + path.sep)) return { ok: false, error: 'Pick a different folder. This one is Vibeerr itself.' };
  fs.mkdirSync(dir, { recursive: true });
  return { ok: true, dir };
}

export const runner = new Runner();
story.onProgress = () => runner.writeBrief();
