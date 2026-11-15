import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';
import type { Ask, ClientMsg, Finished, RecordedLine, RunState, StageId, StoryMsg, Task } from '../../shared/story.ts';
import { ASK_TIMEOUT_MS, RUNS_DIR } from './config.ts';
import { newId } from './ids.ts';
import { stageOf, type Raw } from './stages.ts';
import { narratorKind, translateStep } from './translator.ts';

const FLUSH_MS = 3500;

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
  private pending = new Map<string, { resolve: (o: number | null) => void; timer: NodeJS.Timeout }>();
  private record?: { file: string; start: number };

  private blank(): RunState {
    return { idea: null, running: false, stage: 'plan', visited: [], tasks: [], now: '', ask: null, finished: null, narrator: narratorKind() };
  }

  // ---------------------------------------------------------------- browsers

  addClient(ws: WebSocket) {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: 'state', data: this.state } satisfies StoryMsg));
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw)) as ClientMsg;
        if (m.type === 'answer') this.answer(m.id, m.option);
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
  start(idea: string, slug: string, fresh: boolean) {
    const keep = fresh ? [] : this.state.tasks;
    this.state = { ...this.blank(), idea, running: true, tasks: keep, visited: fresh ? ['plan'] : this.state.visited, stage: 'plan' };
    this.buffer = [];
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    this.record = { file: path.join(RUNS_DIR, `${slug}-${Date.now().toString(36)}.jsonl`), start: Date.now() };
    this.send({ type: 'state', data: this.state });
    // The recording starts with the state so a replay can begin from a clean screen.
    fs.appendFileSync(this.record.file, JSON.stringify({ t: 0, msg: { type: 'state', data: this.state } }) + '\n');
    this.say(fresh
      ? 'Your builder is reading your idea and getting the blueprint paper out.'
      : 'Your builder is back on site and looking at what you want changed.');
    if (fresh) this.addTask('plan', 'Read your idea carefully');
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  /** Feed one raw step from the agent. */
  raw(r: Raw) {
    if (!this.state.running) return;
    this.buffer.push(r);
  }

  private say(text: string) {
    this.state.now = text;
    this.send({ type: 'now', stage: this.state.stage, text });
  }

  private setStage(stage: StageId) {
    if (stage === this.state.stage) return;
    this.state.stage = stage;
    if (!this.state.visited.includes(stage)) this.state.visited.push(stage);
    this.send({ type: 'stage', stage });
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
        if (meaningful) for (const t of words.tasks) this.addTask(part.stage, t);
        if (part.items.some((r) => r.kind === 'problem')) this.problem('The builder found a problem and is fixing it.');
      }
    } finally {
      this.busy = false;
    }
  }

  /** Put whatever is waiting into words right now. */
  async flushNow() {
    for (let i = 0; i < 40 && this.busy; i++) await new Promise((r) => setTimeout(r, 150));
    await this.flush(true);
  }

  async finish(done: Finished) {
    clearInterval(this.timer);
    await this.flushNow();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve(null); }
    this.pending.clear();
    this.state.ask = null;
    this.state.running = false;
    if (done.ok) this.setStage('done');
    this.state.finished = done;
    this.state.now = done.ok ? 'Move-in day. Your app is ready.' : 'The builder has stopped.';
    this.send({ type: 'now', stage: this.state.stage, text: this.state.now });
    this.send({ type: 'finished', data: done });
    this.record = undefined;
  }

  problem(text: string) { this.send({ type: 'problem', text }); }

  // ---------------------------------------------------------------- questions for the person

  /** Shows a question and waits. Resolves with the option index, or null if nobody answered in time. */
  ask(card: Omit<Ask, 'id'>): Promise<number | null> {
    const ask: Ask = { ...card, id: newId('ask_') };
    this.state.ask = ask;
    this.send({ type: 'ask', data: ask });
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(ask.id); this.clearAsk(ask.id, null); resolve(null); }, ASK_TIMEOUT_MS);
      this.pending.set(ask.id, { resolve, timer });
    });
  }

  private clearAsk(id: string, option: number | null) {
    if (this.state.ask?.id === id) this.state.ask = null;
    this.send({ type: 'answered', id, option });
  }

  private answer(id: string, option: number) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    this.clearAsk(id, option);
    p.resolve(option);
  }
}

export const story = new Story();
