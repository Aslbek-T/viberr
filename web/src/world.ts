import { stageInfo, type Block, type StageId } from '../../shared/story.ts';

// The building site. Every part of the app is a block in its district, and the builder walks between
// the blocks doing the work. Style inspired by our teammate's VibeWorld (github.com/DevBehruz/vibeerr),
// redrawn as plain SVG so it needs no game engine and works with the keyboard.

const W = 1200, H = 640;
const ROAD = 466;                    // where the builder walks between districts
const DISTRICTS: StageId[] = ['setup', 'look', 'logic', 'memory', 'check'];
const DX = (i: number) => 30 + i * 230;
const DW = 216, DY = 96, DH = 330;
/** The real word for each district, so people learn it while they watch. */
const SUB: Partial<Record<StageId, string>> = { setup: 'getting ready', look: 'what you see', logic: 'what it does', memory: 'what it keeps', check: 'making sure' };
const PLAN_AT = { x: 150, y: 590 };  // the plan desk, bottom left
const READY_AT = { x: 1060, y: 590 }; // the ready gate, bottom right
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced() ? Math.min(ms, 60) : ms));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const C = { hat: '#f4c858', vest: '#e8743b', skin: '#f2c7a0', pants: '#2b4a66', line: '#16302a', wood: '#a67c4b' };

/** The builder: hardhat, vest and a tool arm. Feet at y=61. */
export function builder(x: number, y: number, scale = 1, flip = false, tool: 'hammer' | 'pencil' | 'wave' = 'hammer'): string {
  const held = tool === 'hammer'
    ? `<rect x="11.5" y="26" width="4" height="20" rx="1.5" fill="${C.wood}"/><rect x="6" y="42" width="15" height="8" rx="2" fill="#5b6b7a"/>`
    : tool === 'pencil' ? `<rect x="11.5" y="26" width="4" height="18" rx="1.5" fill="${C.hat}"/><path d="M11.5 44h4l-2 5z" fill="${C.line}"/>` : '';
  return `<g transform="translate(${x},${y}) scale(${flip ? -scale : scale},${scale})">
    <ellipse cx="0" cy="62" rx="22" ry="4.5" fill="#000" opacity=".2"/>
    <g class="legs"><rect class="leg l" x="-10" y="34" width="8" height="27" rx="3" fill="${C.pants}"/><rect class="leg r" x="2" y="34" width="8" height="27" rx="3" fill="${C.pants}"/></g>
    <g class="bob">
      <rect x="-17" y="8" width="7" height="21" rx="3.5" fill="${C.skin}"/>
      <rect x="-13" y="5" width="26" height="33" rx="8" fill="${C.vest}"/>
      <rect x="-13" y="19" width="26" height="5" fill="${C.hat}"/>
      <circle cx="0" cy="-7" r="11" fill="${C.skin}"/>
      <circle cx="-1" cy="-7" r="1.6" fill="${C.line}"/><circle cx="6" cy="-7" r="1.6" fill="${C.line}"/>
      <path d="M-1 -2q4 3 8 0" stroke="${C.line}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M-12.5 -10a12.5 12.5 0 0 1 25 0z" fill="${C.hat}"/><rect x="-15" y="-11.5" width="32" height="4" rx="2" fill="#e0ae3a"/>
      <g class="arm ${tool}"><rect x="10" y="7" width="7" height="22" rx="3.5" fill="${C.skin}"/>${held}</g>
    </g>
  </g>`;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Where block number `n` of a district stands (its foot). Two columns, three rows, then it wraps. */
function plot(stage: StageId, n: number) {
  const i = DISTRICTS.indexOf(stage);
  const slot = n % 6;
  return { x: DX(i) + 58 + (slot % 2) * 100, y: DY + 118 + Math.floor(slot / 2) * 100 };
}

function blockSvg(b: Block, x: number, y: number, fresh: boolean): string {
  const color = stageInfo(b.stage).color;
  const h = 26 + b.level * 14, w = 64, d = 12;
  const rows = Math.max(1, Math.floor((h - 14) / 14));
  const wins = Array.from({ length: rows }, (_, r) => [0, 1, 2].map((c) =>
    `<rect x="${-w / 2 + 9 + c * 18}" y="${-h + 8 + r * 14}" width="10" height="8" rx="1.5" fill="#20403a" opacity=".55"/>`).join('')).join('');
  const label = b.name.length > 19 ? b.name.slice(0, 18) + '…' : b.name;
  return `<g class="block${fresh ? ' rise' : ''}" data-id="${esc(b.id)}" transform="translate(${x},${y})" tabindex="0" role="button"
      aria-label="${esc(`${b.name}, in ${stageInfo(b.stage).name}. ${b.does}`)}">
    <ellipse cx="6" cy="4" rx="44" ry="10" fill="#0b2019" opacity=".3"/>
    <g class="body">
      <path d="M${w / 2} ${-h}l${d} ${-d}v${h}l${-d} ${d}z" fill="${shade(color, 0.72)}"/>
      <path d="M${-w / 2} ${-h}l${d} ${-d}h${w}l${-d} ${d}z" fill="${shade(color, 1.18)}"/>
      <rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" fill="${color}"/>
      ${wins}
      <rect x="-6" y="-14" width="12" height="14" fill="#20403a" opacity=".7"/>
    </g>
    <text class="blabel" x="0" y="20" text-anchor="middle">${esc(label)}</text>
  </g>`;
}

function tree(x: number, y: number, s: number) {
  return `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="4" cy="2" rx="24" ry="9" fill="#10291f" opacity=".3"/><rect x="-4" y="-26" width="8" height="27" fill="#806b49"/>
    <circle cy="-36" r="21" fill="#1f4233"/><circle cx="-5" cy="-42" r="18" fill="#426d48"/><circle cx="-9" cy="-47" r="11" fill="#60865a"/></g>`;
}

/** The connections that teach how an app is put together. Each lights up once both ends have blocks. */
const LINKS: { from: StageId; to: StageId; text: string; lift: number }[] = [
  { from: 'look', to: 'logic', text: 'a tap starts an action', lift: 44 },
  { from: 'logic', to: 'memory', text: 'actions save and load', lift: 44 },
  { from: 'check', to: 'logic', text: 'try-outs test the actions', lift: 84 },
];

function staticSite(): string {
  let s = `<rect width="${W}" height="${H}" fill="#294b40"/>`;
  for (let i = 0; i < 260; i++) s += `<ellipse cx="${(i * 173 + 71) % W}" cy="${(i * 281 + 53) % H}" rx="${2 + (i % 3)}" ry="1.5" fill="${i % 3 ? '#345747' : '#3f6150'}" opacity=".7"/>`;
  // Road and footpaths up into each district.
  s += `<rect x="20" y="${ROAD - 26}" width="${W - 40}" height="52" rx="22" fill="#8a8b73"/><rect x="20" y="${ROAD - 18}" width="${W - 40}" height="36" rx="16" fill="#424f49"/>`;
  for (let x = 44; x < W - 40; x += 40) s += `<rect x="${x}" y="${ROAD - 1}" width="18" height="3" fill="#c6c0a0" opacity=".45"/>`;
  DISTRICTS.forEach((id, i) => {
    const st = stageInfo(id), x = DX(i);
    s += `<g class="district" data-stage="${id}">
      <rect class="dbg" x="${x}" y="${DY}" width="${DW}" height="${DH}" rx="22" fill="${shade(st.color, 0.42)}" stroke="${st.color}" stroke-opacity=".25" stroke-width="2"/>
      <rect x="${x + DW / 2 - 14}" y="${DY + DH - 6}" width="28" height="${ROAD - DY - DH - 12}" fill="#b5aa82" opacity=".75"/>
      <text class="dname" x="${x + 18}" y="${DY + 30}" fill="${st.color}">${st.name.toUpperCase()}</text>
      <text class="dreal" x="${x + 18}" y="${DY + 48}">${SUB[id]}</text>`;
    for (let n = 0; n < 6; n++) { const p = plot(id, n); s += `<rect x="${p.x - 36}" y="${p.y - 56}" width="72" height="60" rx="6" fill="none" stroke="${st.color}" stroke-opacity=".2" stroke-width="2" stroke-dasharray="5 5"/>`; }
    s += `</g>`;
  });
  // The plan desk and the ready gate.
  s += `<g class="spot" data-stage="plan"><rect x="${PLAN_AT.x - 70}" y="${PLAN_AT.y - 52}" width="96" height="10" rx="3" fill="#c79a63"/>
      <rect x="${PLAN_AT.x - 64}" y="${PLAN_AT.y - 42}" width="6" height="40" fill="#a67c4b"/><rect x="${PLAN_AT.x + 14}" y="${PLAN_AT.y - 42}" width="6" height="40" fill="#a67c4b"/>
      <rect x="${PLAN_AT.x - 62}" y="${PLAN_AT.y - 64}" width="80" height="14" rx="2" fill="#1f4f7a" transform="rotate(-4 ${PLAN_AT.x - 22} ${PLAN_AT.y - 57})"/>
      <text class="dname" x="${PLAN_AT.x - 70}" y="${PLAN_AT.y + 26}" fill="#9fc3e8">IDEA</text></g>`;
  s += `<g class="spot" data-stage="done"><rect x="${READY_AT.x + 30}" y="${READY_AT.y - 110}" width="6" height="112" fill="#d6b56c"/>
      <path class="flag" d="M${READY_AT.x + 36} ${READY_AT.y - 108}h52l-12 14l12 14h-52z" fill="#b9d897"/>
      <text class="dname" x="${READY_AT.x - 40}" y="${READY_AT.y + 26}" fill="#b9d897">DONE</text></g>`;
  for (let i = 0; i < 12; i++) s += tree(290 + i * 62 + (i % 3) * 9, 560 + (i % 2) * 44, 0.7 + (i % 3) * 0.12);
  return s;
}

function linkSvg(l: (typeof LINKS)[number]) {
  const a = DX(DISTRICTS.indexOf(l.from)) + DW / 2, b = DX(DISTRICTS.indexOf(l.to)) + DW / 2;
  const top = DY - l.lift + 30, mid = (a + b) / 2;
  return `<g class="link" data-from="${l.from}" data-to="${l.to}">
    <path d="M${a} ${DY + 4}C${a} ${top} ${b} ${top} ${b} ${DY + 4}" fill="none" stroke="#f0f0db" stroke-width="3" stroke-dasharray="8 8" stroke-linecap="round"/>
    <circle class="pulse" r="5" fill="#f4c858"><animateMotion dur="2.4s" repeatCount="indefinite" path="M${a} ${DY + 4}C${a} ${top} ${b} ${top} ${b} ${DY + 4}"/></circle>
    <text x="${mid}" y="${top + 10}" text-anchor="middle" class="ltext">${esc(l.text)}</text></g>`;
}

export class World {
  private svg: SVGSVGElement;
  private blocksLayer: SVGGElement;
  private fx: SVGGElement;
  private bot: SVGGElement;
  private bubble: SVGGElement;
  private pos = { x: PLAN_AT.x + 40, y: PLAN_AT.y };
  private placed = new Map<string, { b: Block; n: number }>();
  private walkingTo: Promise<void> = Promise.resolve();
  onPick: (b: Block) => void = () => {};

  constructor(private root: HTMLElement) {
    root.innerHTML = `<svg class="world-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The building site: one district per part of your app">
      ${staticSite()}<g class="links">${LINKS.map(linkSvg).join('')}</g><g class="blocks"></g><g class="fx"></g>
      <g class="bot"></g><g class="say" visibility="hidden"><rect rx="10" height="30" fill="#152a2b" stroke="#f4c858" stroke-width="1.5"/><text y="20" fill="#f0f0db"></text></g></svg>`;
    this.svg = root.querySelector('svg')!;
    this.blocksLayer = root.querySelector('.blocks')!;
    this.fx = root.querySelector('.fx')!;
    this.bot = root.querySelector('.bot')!;
    this.bubble = root.querySelector('.say')!;
    this.drawBot('idle');
    const pick = (e: Event) => {
      const g = (e.target as Element).closest('.block');
      const hit = g && this.placed.get(g.getAttribute('data-id')!);
      if (hit) this.onPick(hit.b);
    };
    this.svg.addEventListener('click', pick);
    this.svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
  }

  /** Draws everything at once, with no walking (used when a page opens in the middle of a build). */
  reset(blocks: Block[], stage: StageId, finished: boolean) {
    this.placed.clear();
    this.blocksLayer.innerHTML = '';
    this.fx.innerHTML = '';
    for (const b of blocks) this.put(b, false);
    this.focus(stage);
    this.svg.classList.toggle('finished', finished);
    const at = finished ? { x: READY_AT.x - 10, y: READY_AT.y } : stage === 'plan' ? { x: PLAN_AT.x + 40, y: PLAN_AT.y } : this.door(stage);
    this.pos = at;
    this.drawBot(finished ? 'wave' : stage === 'plan' ? 'pencil' : 'idle');
    this.say('');
  }

  focus(stage: StageId) {
    this.svg.querySelectorAll('.district, .spot').forEach((d) => d.classList.toggle('on', d.getAttribute('data-stage') === stage));
  }

  private door(stage: StageId) {
    if (stage === 'plan') return { x: PLAN_AT.x + 40, y: PLAN_AT.y };
    if (stage === 'done') return { x: READY_AT.x - 10, y: READY_AT.y };
    return { x: DX(DISTRICTS.indexOf(stage)) + DW / 2, y: ROAD + 6 };
  }

  private drawBot(mode: 'idle' | 'walk' | 'work' | 'wave' | 'pencil', flip = false) {
    const tool = mode === 'wave' ? 'wave' : mode === 'pencil' ? 'pencil' : 'hammer';
    this.bot.setAttribute('class', `bot ${mode}`);
    this.bot.innerHTML = builder(0, -61 * 0.9, 0.9, flip, tool);
    this.bot.setAttribute('transform', `translate(${this.pos.x},${this.pos.y})`);
    this.placeBubble();
  }

  say(text: string) {
    const t = this.bubble.querySelector('text')!;
    t.textContent = text;
    this.bubble.setAttribute('visibility', text ? 'visible' : 'hidden');
    this.placeBubble();
  }

  private placeBubble() {
    const t = this.bubble.querySelector('text')!;
    const w = Math.min(320, 22 + (t.textContent ?? '').length * 7.2);
    const r = this.bubble.querySelector('rect')!;
    r.setAttribute('width', String(w));
    t.setAttribute('x', '11');
    const x = Math.max(6, Math.min(W - w - 6, this.pos.x - w / 2));
    this.bubble.setAttribute('transform', `translate(${x},${Math.max(4, this.pos.y - 112)})`);
  }

  /** Walks along the road to a point, step by step. */
  private async walk(to: { x: number; y: number }) {
    const pts = [{ x: this.pos.x, y: ROAD + 6 }, { x: to.x, y: ROAD + 6 }, to];
    if (Math.abs(this.pos.y - (ROAD + 6)) < 2) pts.shift();
    for (const p of pts) {
      const from = { ...this.pos };
      const dist = Math.hypot(p.x - from.x, p.y - from.y);
      if (dist < 1) continue;
      this.drawBot('walk', p.x < from.x);
      if (reduced()) { this.pos = p; this.drawBot('walk', p.x < from.x); continue; }
      const ms = Math.max(160, dist / 0.42);
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / ms);
          this.pos = { x: from.x + (p.x - from.x) * k, y: from.y + (p.y - from.y) * k };
          this.bot.setAttribute('transform', `translate(${this.pos.x},${this.pos.y})`);
          this.placeBubble();
          if (k < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
    }
  }

  /** The builder goes to a district's entrance (or the plan desk, or the ready gate). */
  async goTo(stage: StageId) {
    this.focus(stage);
    await (this.walkingTo = this.walkingTo.then(() => this.walk(this.door(stage))));
    this.drawBot(stage === 'plan' ? 'pencil' : stage === 'done' ? 'wave' : 'idle');
  }

  /** The builder walks to the block's plot, works on it, and the block rises (or grows a floor). */
  async build(b: Block, label: string) {
    const old = this.placed.get(b.id);
    const n = old?.n ?? [...this.placed.values()].filter((p) => p.b.stage === b.stage).length;
    const p = plot(b.stage, n);
    this.focus(b.stage);
    this.say(label);
    await this.walk({ x: p.x + 46, y: p.y + 8 });
    this.drawBot('work', true);
    const sc = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    sc.innerHTML = `<g class="scaffold" transform="translate(${p.x},${p.y})">
      ${[-36, 0, 36].map((x) => `<line x1="${x}" y1="4" x2="${x}" y2="-84" stroke="#d6c69b" stroke-width="3"/>`).join('')}
      ${[0, 28, 56, 84].map((y) => `<line x1="-40" y1="${-y}" x2="40" y2="${-y}" stroke="#d6c69b" stroke-width="3"/>`).join('')}
      <rect x="-40" y="-104" width="80" height="9" rx="4" fill="#17382f"/><rect class="bar" x="-39" y="-103" width="78" height="7" rx="3" fill="${stageInfo(b.stage).color}"/></g>`;
    this.fx.appendChild(sc);
    await sleep(old ? 900 : 1400);
    sc.remove();
    this.put(b, true);
    this.dust(p);
    this.drawBot('idle', true);
    await sleep(350);
  }

  private put(b: Block, animate: boolean) {
    const old = this.placed.get(b.id);
    const n = old?.n ?? [...this.placed.values()].filter((p) => p.b.stage === b.stage).length;
    this.placed.set(b.id, { b, n });
    const p = plot(b.stage, n);
    this.blocksLayer.querySelector(`[data-id="${CSS.escape(b.id)}"]`)?.remove();
    // Blocks lower on the screen are drawn last so they stand in front.
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tmp.innerHTML = blockSvg(b, p.x, p.y, animate);
    const el = tmp.firstElementChild!;
    el.setAttribute('data-y', String(p.y));
    const after = [...this.blocksLayer.children].find((c) => Number(c.getAttribute('data-y')) > p.y);
    this.blocksLayer.insertBefore(el, after ?? null);
    this.links();
  }

  private links() {
    const has = (s: StageId) => [...this.placed.values()].some((p) => p.b.stage === s);
    this.svg.querySelectorAll('.link').forEach((l) => l.classList.toggle('on', has(l.getAttribute('data-from') as StageId) && has(l.getAttribute('data-to') as StageId)));
  }

  /** A green tick on every block in the Checks district, and a flash over the rules they test. */
  passed() {
    this.svg.querySelectorAll('.block').forEach((g) => {
      const hit = this.placed.get(g.getAttribute('data-id')!);
      if (!hit || g.querySelector('.ok')) return;
      if (hit.b.stage === 'check' || hit.b.stage === 'logic') {
        g.insertAdjacentHTML('beforeend', `<g class="ok"><circle cx="30" cy="${-36 - hit.b.level * 14}" r="10" fill="#2f9e5b" stroke="#fff" stroke-width="2"/><path d="M25 ${-36 - hit.b.level * 14}l4 4l7-8" stroke="#fff" stroke-width="2.5" fill="none"/></g>`);
      }
    });
  }

  private dust(p: { x: number; y: number }) {
    if (reduced()) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = Array.from({ length: 9 }, (_, i) => `<circle class="dust" style="--dx:${(i - 4) * 9}px" cx="${p.x + (i - 4) * 7}" cy="${p.y}" r="${3 + (i % 3)}" fill="#e3d4a2"/>`).join('');
    this.fx.appendChild(g);
    setTimeout(() => g.remove(), 800);
  }

  async celebrate() {
    await this.goTo('done');
    this.svg.classList.add('finished');
    this.say('Your app is ready!');
    if (reduced()) return;
    this.confetti();
  }

  /**
   * Two confetti cannons fire from the bottom corners. Each piece has its own speed, spin and flutter:
   * it shoots up, slows in the air, tumbles (the flat side catches the light), drifts and falls, then fades.
   */
  private confetti() {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('aria-hidden', 'true');
    const colors = ['#73cfab', '#a89ae8', '#efbc6d', '#e98f8f', '#f4c858', '#9fc3e8', '#f0f0db'];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    type Bit = { el: SVGElement; x: number; y: number; vx: number; vy: number; rot: number; vr: number; flip: number; vf: number; sway: number; phase: number; size: number; life: number };
    const bits: Bit[] = [];
    const fire = (fromX: number, dir: 1 | -1, count: number, delay: number) => {
      for (let i = 0; i < count; i++) {
        const shape = Math.random();
        const size = rand(6, 11);
        const el = document.createElementNS(NS, shape < 0.6 ? 'rect' : shape < 0.85 ? 'circle' : 'path') as SVGElement;
        const color = colors[Math.floor(Math.random() * colors.length)];
        if (shape < 0.6) { el.setAttribute('x', String(-size / 2)); el.setAttribute('y', String(-size * 0.3)); el.setAttribute('width', String(size)); el.setAttribute('height', String(size * 0.6)); el.setAttribute('rx', '1.2'); }
        else if (shape < 0.85) el.setAttribute('r', String(size * 0.32));
        else { el.setAttribute('d', `M${-size} 0 q${size / 2} ${-size / 2} ${size} 0 t${size} 0`); el.setAttribute('fill', 'none'); el.setAttribute('stroke', color); el.setAttribute('stroke-width', '2.4'); el.setAttribute('stroke-linecap', 'round'); }
        if (shape < 0.85) el.setAttribute('fill', color);
        el.setAttribute('opacity', '0');
        g.appendChild(el);
        const angle = (dir === 1 ? rand(-80, -45) : rand(-135, -100)) * (Math.PI / 180);
        const speed = rand(1150, 1650);
        bits.push({ el, x: fromX, y: H + 10, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rot: rand(0, 360), vr: rand(-540, 540),
          flip: rand(0, Math.PI * 2), vf: rand(6, 14), sway: rand(30, 70), phase: rand(0, Math.PI * 2), size, life: -delay - rand(0, 0.12) });
      }
    };
    fire(40, 1, 70, 0);
    fire(W - 40, -1, 70, 0);
    fire(W * 0.5, Math.random() < 0.5 ? 1 : -1, 40, 0.5); // a second, smaller pop from the middle
    this.fx.appendChild(g);
    const GRAVITY = 650, DRAG = 1.15, LIFE = 6.5;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let alive = 0;
      for (const b of bits) {
        b.life += dt;
        if (b.life < 0) { alive++; continue; }
        if (b.life > LIFE) { b.el.remove(); continue; }
        alive++;
        // Air resistance slows the burst quickly; once falling, paper drifts down slowly and sways.
        b.vx -= b.vx * DRAG * dt;
        b.vy += GRAVITY * dt;
        b.vy -= b.vy * DRAG * dt;
        if (b.vy > b.size * 9) b.vy = b.size * 9; // paper falls slowly, bigger pieces a bit faster
        b.x += b.vx * dt + Math.sin(b.life * 3 + b.phase) * b.sway * dt * (b.vy > 0 ? 1 : 0.2);
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.flip += b.vf * dt;
        const tumble = Math.cos(b.flip); // seeing the piece edge-on, then flat again
        const fade = b.life > LIFE - 0.8 ? (LIFE - b.life) / 0.8 : Math.min(1, b.life * 8);
        b.el.setAttribute('opacity', (fade * (tumble < 0 ? 0.72 : 1)).toFixed(2)); // the back side looks darker
        b.el.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.rot.toFixed(0)}) scale(1 ${Math.max(0.08, Math.abs(tumble)).toFixed(2)})`);
      }
      if (alive) requestAnimationFrame(step); else g.remove();
    };
    requestAnimationFrame(step);
  }
}
