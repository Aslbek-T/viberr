import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';
import type {
  AgentSource, BuildEvent, ClientMsg, DecisionCard, ServerMsg, SessionLine, UserProfile,
} from '../../shared/events.ts';
import { DECISION_TIMEOUT_MS, SESSIONS_DIR } from './config.ts';
import { conceptFor, learnedConcepts, markLearned } from './concepts.ts';
import { newId } from './ids.ts';
import { narrate } from './narrator/index.ts';
import { pingPhone } from './notify.ts';

export const DEFAULT_PROFILE: UserProfile = {
  userId: 'demo', field: 'Biology', level: 'new', style: 'visual', theme: 'lab',
  a11y: { reducedMotion: false, colorSafe: false, dyslexiaFont: false, captions: true, voice: false, lang: 'en' },
};

type Pending = { resolve: (option: number | null) => void; timer: NodeJS.Timeout };

class Hub {
  clients = new Set<WebSocket>();
  profile: UserProfile = DEFAULT_PROFILE;
  mode: 'live' | 'replay' = 'live';
  sources = new Set<AgentSource>();
  private pending = new Map<string, Pending>();
  private seenThisSession = new Set<string>();
  private recorders = new Map<string, { file: string; start: number }>();
  /** Replayer hooks in here so it can resume after a decision. */
  onDecide?: (cardId: string, option: number) => void;

  addClient(ws: WebSocket) {
    this.clients.add(ws);
    this.sendTo(ws, this.statusMsg());
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      try { this.handleClient(JSON.parse(String(raw)) as ClientMsg); } catch (err) {
        console.warn('[hub] bad client message', err);
      }
    });
  }

  private handleClient(m: ClientMsg) {
    switch (m.type) {
      case 'profile':
        this.profile = m.data;
        break;
      case 'decide':
        this.resolveDecision(m.cardId, m.option);
        break;
      case 'learned':
        markLearned(this.profile.userId, m.conceptId);
        break;
      case 'replay':
        // handled by server.ts which owns the replayer
        this.onReplayRequest?.(m.file, m.speed);
        break;
    }
  }
  onReplayRequest?: (file: string, speed: number) => void;

  statusMsg(): ServerMsg {
    return { type: 'status', data: { mode: this.mode, sources: [...this.sources] } };
  }

  broadcast(msg: ServerMsg, record = true) {
    const s = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === 1) ws.send(s);
    if (record && this.mode === 'live') this.record(msg);
  }

  private sendTo(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  private currentSessionId?: string;
  private record(msg: ServerMsg) {
    const sid = msg.type === 'event' ? msg.data.sessionId : this.currentSessionId;
    if (!sid) return;
    this.currentSessionId = sid;
    let r = this.recorders.get(sid);
    if (!r) {
      const dir = path.join(SESSIONS_DIR, 'live');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      r = { file: path.join(dir, `${stamp}-${sid.slice(0, 8)}.jsonl`), start: Date.now() };
      this.recorders.set(sid, r);
      console.log(`[rec] recording to ${path.relative(SESSIONS_DIR, r.file)}`);
    }
    const line: SessionLine = { t: Date.now() - r.start, msg };
    fs.appendFileSync(r.file, JSON.stringify(line) + '\n');
  }

  /** Main pipeline for a live event: broadcast, narrate, teach. */
  async emit(e: BuildEvent) {
    if (!this.sources.has(e.source)) {
      this.sources.add(e.source);
      this.broadcast(this.statusMsg(), false);
    }
    this.broadcast({ type: 'event', data: e });
    try {
      const n = await narrate(e, this.profile);
      const concept = conceptFor(e);
      if (concept) n.conceptId = concept.id;
      this.broadcast({ type: 'narration', data: n });
      if (concept && !this.seenThisSession.has(concept.id)) {
        this.seenThisSession.add(concept.id);
        const seenBefore = learnedConcepts(this.profile.userId).includes(concept.id);
        this.broadcast({ type: 'concept', data: { ...concept, seenBefore } });
      }
    } catch (err) {
      console.warn('[hub] narration failed', err);
    }
  }

  /**
   * Show a decision card and wait for the answer. Resolves with the chosen option index,
   * or null on timeout (the hook then falls back to the normal terminal prompt).
   */
  ask(card: Omit<DecisionCard, 'id'>, timeoutMs = DECISION_TIMEOUT_MS): Promise<number | null> {
    const full: DecisionCard = { ...card, id: newId('card_') };
    this.broadcast({ type: 'decision', data: full });
    pingPhone(full.question).catch(() => {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(full.id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(full.id, { resolve, timer });
    });
  }

  private resolveDecision(cardId: string, option: number) {
    const p = this.pending.get(cardId);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(cardId);
      p.resolve(option);
    }
    this.onDecide?.(cardId, option);
  }
}

export const hub = new Hub();
