import type { ClientMsg, ServerMsg, SessionLine } from '../../../shared/events.ts';

type Listener = (m: ServerMsg) => void;

/**
 * One place the World gets messages from. Two modes:
 *  - live: WebSocket to the brain (/ws), auto-reconnect every 2 s
 *  - file: plays a sessions/*.jsonl file in the browser with no brain at all (hosted demo, UI dev)
 * The rest of the app only sees ServerMsg either way.
 */
export class Feed {
  private listeners = new Set<Listener>();
  private ws?: WebSocket;
  private playToken = 0;
  private waitingCard?: { id: string; resume: () => void };
  brainConnected = false;
  onConnection?: (connected: boolean) => void;

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(m: ServerMsg) { for (const fn of this.listeners) fn(m); }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = (import.meta.env.VITE_BRAIN_WS as string | undefined) ?? `${proto}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.brainConnected = true; this.onConnection?.(true); };
    ws.onmessage = (ev) => { try { this.emit(JSON.parse(ev.data)); } catch { /* ignore */ } };
    ws.onclose = () => {
      if (this.brainConnected) this.onConnection?.(false);
      this.brainConnected = false;
      setTimeout(() => this.connect(), 2000);
    };
    ws.onerror = () => ws.close();
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  decide(cardId: string, option: number) {
    if (this.waitingCard?.id === cardId) { this.waitingCard.resume(); this.waitingCard = undefined; }
    this.send({ type: 'decide', cardId, option });
  }

  /** Lists sessions: from the brain if it's up, else the static index shipped with the build. */
  async listSessions(): Promise<string[]> {
    try {
      const r = await fetch(this.brainConnected ? '/api/sessions' : '/sessions/index.json');
      if (r.ok) return await r.json();
    } catch { /* ignore */ }
    return ['fixtures/lab-demo.jsonl', 'fixtures/kitchen-demo.jsonl', 'fixtures/quick.jsonl'];
  }

  /** Replay through the brain when connected (so hooks and phone see it), otherwise in the browser. */
  async replay(file: string, speed: number) {
    if (this.brainConnected) { this.send({ type: 'replay', file, speed }); return; }
    await this.playFile(file, speed);
  }

  async playFile(file: string, speed = 1) {
    const my = ++this.playToken;
    const text = await (await fetch(`/sessions/${file}`)).text();
    const lines: SessionLine[] = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    let prev = 0;
    for (const line of lines) {
      if (my !== this.playToken) return;
      await new Promise((r) => setTimeout(r, Math.min(Math.max(0, line.t - prev) / speed, 8000)));
      prev = line.t;
      if (my !== this.playToken) return;
      const msg = line.msg.type === 'status' ? { ...line.msg, data: { ...line.msg.data, mode: 'replay' as const } } : line.msg;
      this.emit(msg);
      if (msg.type === 'decision') {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 20000);
          this.waitingCard = { id: msg.data.id, resume: () => { clearTimeout(t); resolve(); } };
        });
      }
    }
  }
}
