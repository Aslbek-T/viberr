import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';
import type { AgentId, Ask, Block, ClientMsg, Finished, PlanSection, RecordedLine, RunState, StageId, StoryMsg, Task } from '../../shared/story.ts';
import { ASK_TIMEOUT_MS, RUNS_DIR } from './config.ts';
import { newId } from './ids.ts';
import { stageOf, type Raw } from './stages.ts';
import { explainPause, explainStage, narratorKind, translateStep, type BlockWords } from './translator.ts';

const FLUSH_MS = 3500;
/** After this long with nothing new to say, the guide explains the current part in more depth. */
const QUIET_MS = 14_000;
const ORDER: StageId[] = ['plan', 'setup', 'look', 'logic', 'memory', 'check', 'done'];

/**
 * Turns the raw stream of agent activity into the story the person sees:
 * which stage we are in, what is happening now, and which jobs got done.
 */
class Story {
  clients = new Set<WebSocket>();
  state: RunState = this.blank();
  private buffer: Raw[] = [];
  private timer?: NodeJS.Timeout;
  private busy = false;
  private pending = new Map<string, { resolve: (choice: { option: number | null; plan?: PlanSection[]; summary?: string }) => void; timer: NodeJS.Timeout }>();
  private record?: { file: string; start: number };
  private blockIds = new Map<string, string>(); // file -> block id; files never leave the brain
  private guideAt = new Map<StageId, number>();
  private lastTalk = 0;
  private quiet = new Map<StageId, number>(); // quiet-moment notes given per stage in this run
  /** The runner saves VIBEERR.md whenever the story moves forward. */
  onProgress: (() => void) | null = null;

  private blank(): RunState {
    return { idea: null, running: false, stage: 'plan', visited: [], tasks: [], blocks: [], now: '', ask: null, finished: null,
      narrator: narratorKind(), guides: {}, notes: [], agent: 'claude', folder: '' };
  }

  // ---------------------------------------------------------------- browsers

  addClient(ws: WebSocket) {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: 'state', data: this.state } satisfies StoryMsg));
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw)) as ClientMsg;
        if (m.type === 'answer') this.answer(m.id, m.option, m.plan, m.summary);
      } catch { /* ignore bad messages */ }
    });
  }

  private send(msg: StoryMsg) {
    const s = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === 1) ws.send(s);
    if (this.record && msg.type !== 'state') {
      const line: RecordedLine = { t: Date.now() - this.record.start, msg };
      fs.appendFileSync(this.record.file, JSON.stringify(line) + '\n');
    }
  }

  // ---------------------------------------------------------------- run lifecycle

  /** `fresh` is false when the person asks for a change to the app they already built. */
  start(idea: string, slug: string, fresh: boolean, meta: { agent: AgentId; folder: string }) {
    const keep = fresh ? [] : this.state.tasks;
    const notes = fresh ? [] : this.state.notes;
    const guides = fresh ? {} : this.state.guides;
    if (fresh) this.blockIds.clear();
    this.state = { ...this.blank(), idea, running: true, tasks: keep, blocks: fresh ? [] : this.state.blocks,
      notes, guides, agent: meta.agent, folder: meta.folder,
      visited: fresh ? ['plan'] : this.state.visited, stage: 'plan' };
    this.buffer = [];
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    this.record = { file: path.join(RUNS_DIR, `${slug}-${Date.now().toString(36)}.jsonl`), start: Date.now() };
    this.send({ type: 'state', data: this.state });
    // The recording starts with the state so a replay can begin from a clean screen.
    fs.appendFileSync(this.record.file, JSON.stringify({ t: 0, msg: { type: 'state', data: this.state } }) + '\n');
    this.say(fresh
      ? 'Your builder is reading your idea and getting ready to write a short plan you can edit.'
      : 'Your builder is back and looking at what your change touches.');
    if (fresh) this.addTask('plan', 'Read your idea carefully');
    this.quiet.clear();
    void this.fillGuide('plan');
    void this.fillGuide('setup', true);
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.flush().then(() => this.explainIfQuiet()), FLUSH_MS);
  }

  /** Feed one raw step from the agent. */
  raw(r: Raw) {
    if (!this.state.running) return;
    this.buffer.push(r);
  }

  say(text: string, explain = false) {
    this.state.now = text;
    this.lastTalk = Date.now();
    this.send(explain ? { type: 'now', stage: this.state.stage, text, explain } : { type: 'now', stage: this.state.stage, text });
  }

  /** When the builder has been quiet for a while (a bigger piece of work), the guide explains this part more deeply. */
  private async explainIfQuiet() {
    const stage = this.state.stage;
    const given = this.quiet.get(stage) ?? 0;
    if (!this.state.running || this.state.ask || this.busy || this.buffer.length || stage === 'done') return;
    if (Date.now() - this.lastTalk < QUIET_MS || given >= 2) return;
    this.busy = true;
    try {
      this.quiet.set(stage, given + 1);
      const text = await explainPause(this.state.idea ?? '', stage, this.state.tasks.map((t) => t.text),
        this.state.blocks.map((b) => b.name), given);
      // Only speak if nothing new happened while the note was being written.
      if (this.state.running && !this.state.ask && this.state.stage === stage && !this.buffer.length) this.say(text, true);
    } finally {
      this.busy = false;
    }
  }

  private setStage(stage: StageId) {
    if (stage === this.state.stage) return;
    this.state.stage = stage;
    if (!this.state.visited.includes(stage)) this.state.visited.push(stage);
    this.send({ type: 'stage', stage });
    void this.fillGuide(stage, true);
    // Write the next part's note now, so it is ready to be read the moment the builder arrives there.
    const next = ORDER[ORDER.indexOf(stage) + 1];
    if (next) void this.fillGuide(next, true);
  }

  /** Adds a finished job to a stage's list. */
  task(stage: StageId, text: string) { this.addTask(stage, text); }

  private addTask(stage: StageId, text: string) {
    if (!text || this.state.tasks.some((t) => t.text.toLowerCase() === text.toLowerCase())) return;
    const task: Task = { id: newId('t_'), stage, text };
    this.state.tasks.push(task);
    this.send({ type: 'task', data: task });
  }

  /** Every few seconds: decide the stage for what just happened and put it into words. */
  private async flush(force = false) {
    if (this.busy || !this.buffer.length) return;
    if (this.state.ask && !force) return; // the builder is waiting for the person; don't talk over the question
    this.busy = true;
    try {
      const items = this.buffer.splice(0);
      // Split the batch into runs of steps that belong to the same stage, so no stage is skipped
      // when the builder moves fast. Steps with no opinion follow the stage before them.
      const parts: { stage: StageId; items: Raw[] }[] = [];
      let cur = this.state.stage;
      for (const r of items) {
        const s = stageOf(r) ?? cur;
        if (!parts.length || s !== cur) parts.push({ stage: s, items: [] });
        cur = s;
        parts.at(-1)!.items.push(r);
      }
      for (const part of parts) {
        const meaningful = part.items.some((r) => r.kind === 'write' || r.kind === 'run' || r.kind === 'problem' || r.kind === 'pass');
        if (!meaningful && part.stage === this.state.stage && this.state.now) continue;
        this.setStage(part.stage);
        const words = await translateStep(this.state.idea ?? '', part.stage, part.items, this.state.tasks.map((t) => t.text));
        if (!this.state.running) return;
        this.say(words.now);
        for (const b of words.blocks) this.block(part.stage, b);
        if (meaningful) for (const t of words.tasks) this.addTask(part.stage, t);
        if (part.items.some((r) => r.kind === 'problem')) this.problem('The builder found a problem and is fixing it.');
      }
      this.onProgress?.();
    } finally {
      this.busy = false;
    }
  }

  /** A part of the app was made or improved: add its block, or raise it by one level. */
  private block(stage: StageId, w: BlockWords) {
    if (/\.md$|(^|\/)\./i.test(w.file) || stage === 'plan' || stage === 'done') return;
    const id = this.blockIds.get(w.file);
    const old = id ? this.state.blocks.find((b) => b.id === id) : undefined;
    const block: Block = old ? { ...old, level: Math.min(old.level + 1, 4), does: w.does || old.does }
      : { id: newId('b_'), stage, name: w.name, does: w.does, level: 1 };
    this.blockIds.set(w.file, block.id);
    this.state.blocks = old ? this.state.blocks.map((b) => (b.id === block.id ? block : b)) : [...this.state.blocks, block];
    this.send({ type: 'block', data: block });
  }

  /** How the app is put together, district by district, for the Ready screen. */
  structure(): NonNullable<Finished['structure']> {
    const order: StageId[] = ['look', 'logic', 'memory', 'check', 'setup'];
    return order.map((stage) => ({ stage, parts: this.state.blocks.filter((b) => b.stage === stage).map((b) => ({ name: b.name, does: b.does })) }))
      .filter((d) => d.parts.length);
  }

  /** Put whatever is waiting into words right now. */
  async flushNow() {
    for (let i = 0; i < 40 && this.busy; i++) await new Promise((r) => setTimeout(r, 150));
    await this.flush(true);
  }

  async finish(done: Finished) {
    clearInterval(this.timer);
    await this.flushNow();
    if (done.ok) done = { ...done, structure: this.structure() };
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ option: null }); }
    this.pending.clear();
    this.state.ask = null;
    this.state.running = false;
    if (done.ok) this.setStage('done');
    this.state.finished = done;
    this.state.now = done.ok ? 'Your app is ready. Every block is in place.' : 'The builder has stopped.';
    this.send({ type: 'now', stage: this.state.stage, text: this.state.now });
    this.send({ type: 'finished', data: done });
    this.record = undefined;
  }

  problem(text: string) { this.send({ type: 'problem', text }); }

  // ---------------------------------------------------------------- questions for the person

  /** Shows a question and waits. Resolves with the choice, plus any plan lines the person edited. */
  ask(card: Omit<Ask, 'id'>): Promise<{ option: number | null; plan?: PlanSection[]; summary?: string }> {
    const ask: Ask = { ...card, id: newId('ask_') };
    this.state.ask = ask;
    this.send({ type: 'ask', data: ask });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(ask.id);
        this.clearAsk(ask.id, null);
        resolve({ option: null });
      }, ASK_TIMEOUT_MS);
      this.pending.set(ask.id, { resolve, timer });
    });
  }

  /** Drops a waiting question, for example when the person switches builders. */
  cancelAsk() {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.clearAsk(id, null);
      pending.resolve({ option: null });
    }
    this.pending.clear();
  }

  note(text: string) {
    this.state.notes = [...this.state.notes, text].slice(-12);
    this.send({ type: 'note', text });
    this.onProgress?.();
  }

  setAgent(agent: AgentId) {
    this.state.agent = agent;
    this.send({ type: 'agent', agent });
  }

  /** Back to the opening screen. A build that was running is no longer shown. */
  reset() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.resolve({ option: null }); }
    this.pending.clear();
    this.buffer = [];
    this.record = undefined;
    this.blockIds.clear();
    this.state = this.blank();
    this.send({ type: 'state', data: this.state });
  }

  private async fillGuide(stage: StageId, onlyIfMissing = false) {
    if (onlyIfMissing && this.state.guides[stage]) return;
    const token = (this.guideAt.get(stage) ?? 0) + 1;
    this.guideAt.set(stage, token);
    const text = await explainStage(this.state.idea ?? '', stage);
    if (this.guideAt.get(stage) !== token || !this.state.idea) return;
    this.state.guides = { ...this.state.guides, [stage]: text };
    this.send({ type: 'guide', stage, text });
  }

  private clearAsk(id: string, option: number | null) {
    this.lastTalk = Date.now(); // give the builder a moment to get going again before a quiet-moment note
    if (this.state.ask?.id === id) this.state.ask = null;
    this.send({ type: 'answered', id, option });
  }

  private answer(id: string, option: number, plan?: PlanSection[], summary?: string) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    this.clearAsk(id, option);
    pending.resolve({ option, plan: cleanPlan(plan), summary: summary?.trim().slice(0, 300) || undefined });
  }
}

function cleanPlan(plan?: PlanSection[]): PlanSection[] | undefined {
  if (!Array.isArray(plan)) return undefined;
  const sections = plan.slice(0, 6).map((section) => ({
    title: String(section?.title ?? '').replace(/[`#]/g, '').trim().slice(0, 80),
    items: (Array.isArray(section?.items) ? section.items : [])
      .map((item) => String(item).replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean).slice(0, 8),
  })).filter((section) => section.title && section.items.length);
  return sections.length ? sections : undefined;
}

export const story = new Story();
