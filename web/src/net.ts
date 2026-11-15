import type { ClientMsg, PlanSection, RecordedLine, StoryMsg } from '../../shared/story.ts';

/** Where the story comes from: the brain on this computer, or the recorded demo. */
export interface Feed { answer(id: string, option: number, plan?: PlanSection[], summary?: string): void; close(): void }

/** Live connection to the brain. Reconnects by itself. */
export function live(onMsg: (m: StoryMsg) => void, onStatus: (online: boolean) => void): Feed {
  let ws: WebSocket | null = null;
  let closed = false;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => onStatus(true);
    ws.onmessage = (e) => { try { onMsg(JSON.parse(String(e.data)) as StoryMsg); } catch { /* ignore bad messages */ } };
    ws.onclose = () => { onStatus(false); setTimeout(open, 2000); };
  };
  open();
  return {
    answer(id, option, plan, summary) { ws?.send(JSON.stringify({ type: 'answer', id, option, plan, summary } satisfies ClientMsg)); },
    close() { closed = true; ws?.close(); },
  };
}

/** Plays the recorded build in web/public/demo.jsonl. Needs no brain: it waits at questions like the real thing. */
export async function demo(onMsg: (m: StoryMsg) => void): Promise<Feed> {
  const text = await (await fetch('demo.jsonl')).text();
  const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as RecordedLine);
  let i = 0;
  let timer = 0;
  let closed = false;
  const step = () => {
    if (closed || i >= lines.length) return;
    const { msg } = lines[i];
    i++;
    if (msg.type === 'finished' && msg.data.previewUrl) msg.data.previewUrl = 'demo-app/index.html';
    onMsg(msg);
    if (msg.type === 'ask') return; // wait for the person
    const gap = i < lines.length ? lines[i].t - lines[i - 1].t : 0;
    timer = window.setTimeout(step, Math.min(Math.max(gap, 0), 2500));
  };
  step();
  return {
    answer(id, option) {
      if (closed) return;
      onMsg({ type: 'answered', id, option });
      if (option !== 0) {
        onMsg({ type: 'finished', data: { ok: false, summary: 'You asked the builder to stop. In a real build you would now describe your idea differently and start again.' } });
        closed = true;
        return;
      }
      while (i < lines.length && lines[i].msg.type !== 'answered') i++;
      i++; // skip the recorded answer
      timer = window.setTimeout(step, 400);
    },
    close() { closed = true; clearTimeout(timer); },
  };
}
