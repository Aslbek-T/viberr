import type Phaser from 'phaser';
import type { Room, ThemeId } from '../../../shared/events.ts';

// Every room is drawn with code (no image files needed). Coordinates are local to the room:
// (0,0) is the top-left corner, `fy` is the top of the floor where furniture stands.

type G = Phaser.GameObjects.Graphics;
export interface Emitter { kind: 'bubble' | 'steam' | 'frost'; x: number; y: number; color: number }

export function shade(c: number, f: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const WOOD = 0xc49a6c, WOOD_D = 0x94683f, STEEL = 0xc3ced8, STEEL_D = 0x8795a3, WHITE = 0xf8fafc, INK = 0x39424e, GLASS = 0xd8eef7;
const JUICE = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x7b6fd0, 0x4ea8de, 0xf28482, 0x84a59d];

function rr(g: G, x: number, y: number, w: number, h: number, c: number, r = 4, a = 1) {
  g.fillStyle(c, a); g.fillRoundedRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
function rect(g: G, x: number, y: number, w: number, h: number, c: number, a = 1) { g.fillStyle(c, a); g.fillRect(x, y, w, h); }
function circ(g: G, x: number, y: number, r: number, c: number, a = 1) { g.fillStyle(c, a); g.fillCircle(x, y, r); }
function line(g: G, x1: number, y1: number, x2: number, y2: number, c: number, w = 2, a = 1) { g.lineStyle(w, c, a); g.lineBetween(x1, y1, x2, y2); }
function oval(g: G, x: number, y: number, w: number, h: number, c: number, a = 1) { g.fillStyle(c, a); g.fillEllipse(x, y, w, h); }

// ---------- furniture pieces ----------

function table(g: G, x: number, fy: number, w: number, h: number, top = WOOD, leg = WOOD_D) {
  rect(g, x + 8, fy - h + 8, 7, h - 8, leg); rect(g, x + w - 15, fy - h + 8, 7, h - 8, leg);
  rect(g, x + 12, fy - h * 0.38, w - 24, 4, leg);
  rr(g, x, fy - h, w, 10, top, 3);
}

function cabinet(g: G, x: number, fy: number, w: number, h: number, body: number, top: number) {
  rect(g, x, fy - h + 6, w, h - 6, body);
  const n = Math.max(1, Math.round(w / 52)); const dw = w / n;
  for (let i = 0; i < n; i++) {
    g.lineStyle(2, shade(body, 0.84)); g.strokeRect(x + i * dw + 5, fy - h + 17, dw - 10, h - 26);
    circ(g, x + i * dw + dw - 12, fy - h / 2 + 4, 2.5, shade(body, 0.6));
  }
  rect(g, x, fy - 5, w, 5, shade(body, 0.72));
  rr(g, x - 3, fy - h, w + 6, 9, top, 3);
}

function wallShelf(g: G, x: number, y: number, w: number, c = WOOD_D) {
  rect(g, x, y, w, 5, c); rect(g, x + 8, y + 5, 4, 7, shade(c, 0.8)); rect(g, x + w - 12, y + 5, 4, 7, shade(c, 0.8));
}

/** A row of bottles and jars standing on the line y. */
function bottles(g: G, x: number, y: number, w: number, seed = 0) {
  let cx = x + 3; let i = seed;
  while (cx < x + w - 14) {
    const c = JUICE[i % JUICE.length]; const bw = 10 + ((i * 7) % 3) * 3; const bh = 17 + ((i * 5) % 4) * 4;
    if (i % 3 === 0) {
      rr(g, cx, y - bh, bw, bh, GLASS, 3); rr(g, cx + 1, y - bh * 0.6, bw - 2, bh * 0.6 - 1, c, 2);
      rect(g, cx + bw / 2 - 2, y - bh - 4, 4, 5, STEEL_D);
    } else if (i % 3 === 1) {
      rr(g, cx, y - bh + 4, bw + 2, bh - 4, c, 3); rect(g, cx + 1, y - bh, bw, 5, shade(c, 0.7));
      rect(g, cx + 2, y - bh / 2 - 1, bw - 2, 6, WHITE, 0.85);
    } else {
      rr(g, cx + 1, y - bh + 6, bw - 2, bh - 6, c, 2); rect(g, cx + bw / 2 - 2, y - bh - 1, 4, 8, c);
      rect(g, cx + bw / 2 - 3, y - bh - 3, 6, 3, INK);
    }
    cx += bw + 7; i++;
  }
}

function boxesRow(g: G, x: number, y: number, w: number, seed = 0) {
  let cx = x + 2; let i = seed;
  const cols = [0xd4a373, 0xe9c46a, 0x8ecae6, 0xf4a261, 0xb7b7a4];
  while (cx < x + w - 20) {
    const bw = 20 + ((i * 7) % 3) * 6; const bh = 14 + ((i * 5) % 3) * 6; const c = cols[i % cols.length];
    rect(g, cx, y - bh, bw, bh, c); rect(g, cx + bw / 2 - 3, y - bh, 6, bh, WHITE, 0.55);
    g.lineStyle(1, shade(c, 0.7)); g.strokeRect(cx, y - bh, bw, bh);
    cx += bw + 5; i++;
  }
}

function binders(g: G, x: number, y: number, w: number, seed = 0) {
  let cx = x + 2; let i = seed;
  while (cx < x + w - 9) {
    const c = JUICE[(i * 2) % JUICE.length]; const bh = 26 + ((i * 3) % 3) * 3;
    rr(g, cx, y - bh, 8, bh, c, 1); rect(g, cx + 2, y - bh + 5, 4, 7, WHITE, 0.85);
    cx += 10; i++;
  }
}

function shelfUnit(g: G, x: number, fy: number, w: number, h: number, rows: number, frame: number,
  fill: (sx: number, sy: number, sw: number, i: number) => void) {
  rect(g, x, fy - h, w, h, mix(frame, 0xffffff, 0.55));
  for (let i = 0; i < rows; i++) {
    const sy = fy - (i * h) / rows;
    rect(g, x, sy - 4, w, 4, frame);
    fill(x + 6, sy - 4, w - 12, i);
  }
  rect(g, x, fy - h, w, 4, frame); rect(g, x, fy - h, 4, h, frame); rect(g, x + w - 4, fy - h, 4, h, frame);
}

function flask(g: G, x: number, y: number, c: number, s = 1) {
  const w = 22 * s, h = 26 * s;
  g.fillStyle(GLASS, 1); g.fillTriangle(x, y, x + w, y, x + w / 2, y - h * 1.2);
  rect(g, x + w / 2 - 4 * s, y - h - 6 * s, 8 * s, 14 * s, GLASS);
  g.fillStyle(c, 1); g.fillTriangle(x + 2, y - 1, x + w - 2, y - 1, x + w / 2, y - h * 0.78);
  rect(g, x + w / 2 - 5 * s, y - h - 8 * s, 10 * s, 3 * s, STEEL_D);
}

function beaker(g: G, x: number, y: number, c: number) {
  rr(g, x, y - 22, 18, 22, GLASS, 2); rect(g, x + 1, y - 12, 16, 11, c); rect(g, x - 1, y - 23, 20, 2, STEEL_D);
}

function tubeRack(g: G, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    rr(g, x + 4 + i * 9, y - 25, 6, 23, GLASS, 3); rr(g, x + 5 + i * 9, y - 14, 4, 11, JUICE[i % JUICE.length], 2);
  }
  rect(g, x, y - 11, n * 9 + 6, 4, WOOD_D); rect(g, x, y - 3, n * 9 + 6, 3, WOOD_D);
}

function petri(g: G, cx: number, y: number, c: number) { oval(g, cx, y - 3, 24, 8, GLASS); oval(g, cx, y - 3, 15, 4, c, 0.85); }

function microscope(g: G, x: number, y: number) {
  rr(g, x, y - 7, 42, 7, INK, 3);
  rect(g, x + 28, y - 46, 7, 40, INK);
  rect(g, x + 4, y - 21, 26, 4, STEEL_D);
  line(g, x + 33, y - 50, x + 17, y - 28, STEEL, 9);
  circ(g, x + 34, y - 52, 5.5, INK); rect(g, x + 13, y - 30, 7, 6, INK);
  circ(g, x + 37, y - 28, 4, STEEL_D);
}

/** A screen on a stand. `y` is the surface it stands on. Returns the screen area for drawing content. */
function monitor(g: G, x: number, y: number, w: number, h: number, screen: number) {
  rr(g, x + w / 2 - 14, y - 4, 28, 4, INK, 2); rect(g, x + w / 2 - 3, y - 10, 6, 7, INK);
  rr(g, x, y - 10 - h, w, h, INK, 4); rr(g, x + 3, y - 7 - h, w - 6, h - 7, screen, 2);
  return { x: x + 3, y: y - 7 - h, w: w - 6, h: h - 7 };
}

function freezer(g: G, x: number, fy: number, w: number, h: number, drawers: number) {
  rr(g, x, fy - h, w, h, WHITE, 6);
  g.lineStyle(2, STEEL_D); g.strokeRoundedRect(x, fy - h, w, h, 6);
  const dh = (h - 18) / drawers;
  for (let i = 0; i < drawers; i++) {
    rr(g, x + 6, fy - h + 12 + i * dh, w - 12, dh - 5, 0xdcebf5, 3);
    rect(g, x + w / 2 - 11, fy - h + 16 + i * dh, 22, 3, STEEL_D);
  }
  circ(g, x + w - 10, fy - h + 6, 2.5, 0x4ea8de);
}

function tank(g: G, x: number, fy: number) {
  rr(g, x, fy - 48, 28, 48, STEEL, 10); rect(g, x + 9, fy - 56, 10, 9, STEEL_D); rect(g, x + 6, fy - 59, 16, 4, INK);
  rr(g, x + 4, fy - 32, 20, 9, 0x4ea8de, 2);
}

function stove(g: G, x: number, fy: number, w: number, h: number) {
  rr(g, x, fy - h, w, h, 0xe6e9ed, 4); rect(g, x, fy - h, w, 6, INK);
  rr(g, x + 8, fy - h + 24, w - 16, h - 32, INK, 4); rr(g, x + 13, fy - h + 29, w - 26, h - 43, 0x6b5a4c, 3);
  for (let i = 0; i < 4; i++) circ(g, x + 14 + (i * (w - 28)) / 3, fy - h + 15, 3.5, 0xd1495b);
  rect(g, x + 10, fy - h - 3, 30, 3, INK); rect(g, x + w - 40, fy - h - 3, 30, 3, INK);
}

function pot(g: G, x: number, y: number, c: number, w = 34) {
  rect(g, x - 6, y - 17, 7, 4, shade(c, 0.7)); rect(g, x + w - 1, y - 17, 7, 4, shade(c, 0.7));
  rr(g, x, y - 21, w, 21, c, 4); rr(g, x - 1, y - 25, w + 2, 5, shade(c, 0.8), 2); circ(g, x + w / 2, y - 27, 3, INK);
}

function pan(g: G, x: number, y: number) { line(g, x, y, x, y + 12, INK, 3); circ(g, x, y + 23, 11, INK); circ(g, x, y + 23, 8, 0x66707c); }

function bell(g: G, cx: number, y: number) {
  g.fillStyle(0xe9c46a, 1); g.slice(cx, y - 3, 11, Math.PI, Math.PI * 2, false); g.fillPath();
  rect(g, cx - 13, y - 3, 26, 3, 0xb08900); circ(g, cx, y - 15, 2.5, 0xb08900);
}

/** A pass-through opening in the wall with a ledge: the order window, or the lab's sample hatch. */
function hatch(g: G, x: number, y: number, w: number, h: number, frame: number, inside: number) {
  rr(g, x - 6, y - 6, w + 12, h + 12, frame, 4); rect(g, x, y, w, h, inside);
  rect(g, x, y, w, 8, shade(inside, 0.85));
  rr(g, x - 10, y + h, w + 20, 8, mix(frame, 0xffffff, 0.25), 3);
}

function tickets(g: G, x: number, y: number, w: number, n: number) {
  rect(g, x, y, w, 3, STEEL_D);
  for (let i = 0; i < n; i++) {
    const tx = x + 6 + (i * (w - 22)) / Math.max(1, n - 1); const th = 20 + (i % 2) * 6;
    rect(g, tx, y + 3, 12, th, WHITE); line(g, tx + 2, y + 9, tx + 10, y + 9, STEEL_D, 1); line(g, tx + 2, y + 14, tx + 8, y + 14, STEEL_D, 1);
  }
}

function crate(g: G, x: number, fy: number, w: number, h: number, produce?: number) {
  if (produce !== undefined) for (let i = 0; i < Math.floor(w / 13); i++) circ(g, x + 9 + i * 13, fy - h - 1, 7, i % 2 ? shade(produce, 0.85) : produce);
  rect(g, x, fy - h, w, h, WOOD);
  g.lineStyle(2, WOOD_D); g.strokeRect(x, fy - h, w, h);
  for (let i = 1; i < 3; i++) g.lineBetween(x, fy - h + (i * h) / 3, x + w, fy - h + (i * h) / 3);
  rect(g, x + 5, fy - h, 5, h, WOOD_D, 0.6); rect(g, x + w - 10, fy - h, 5, h, WOOD_D, 0.6);
}

function box(g: G, x: number, fy: number, w: number, h: number, c = 0xd4a373) {
  rect(g, x, fy - h, w, h, c); rect(g, x + w / 2 - 4, fy - h, 8, h, 0xf1e3c4, 0.8);
  g.lineStyle(1, shade(c, 0.7)); g.strokeRect(x, fy - h, w, h);
}

function sack(g: G, x: number, fy: number) {
  oval(g, x + 16, fy - 16, 32, 34, 0xe6d5b8); rect(g, x + 10, fy - 37, 12, 7, 0xcbb994); line(g, x + 9, fy - 30, x + 23, fy - 30, 0xa68a64, 2);
}

function fridge(g: G, x: number, fy: number, w: number, h: number) {
  rr(g, x, fy - h, w, h, 0xe9eef2, 6);
  g.lineStyle(2, STEEL_D); g.strokeRoundedRect(x, fy - h, w, h, 6);
  g.lineBetween(x, fy - h * 0.62, x + w, fy - h * 0.62);
  rect(g, x + w - 11, fy - h + 12, 4, h * 0.22, STEEL_D); rect(g, x + w - 11, fy - h * 0.62 + 8, 4, h * 0.3, STEEL_D);
  rect(g, x + 10, fy - h + 14, 9, 9, 0xe76f51); rect(g, x + 24, fy - h + 20, 8, 8, 0xe9c46a);
}

function filingCabinet(g: G, x: number, fy: number, w: number, h: number, c: number, drawers = 3) {
  rr(g, x, fy - h, w, h, c, 3);
  const dh = (h - 6) / drawers;
  for (let i = 0; i < drawers; i++) {
    g.lineStyle(2, shade(c, 0.75)); g.strokeRect(x + 4, fy - h + 4 + i * dh, w - 8, dh - 4);
    rect(g, x + w / 2 - 7, fy - h + 9 + i * dh, 14, 7, WHITE, 0.9);
    rect(g, x + w / 2 - 8, fy - h + 4 + i * dh + dh * 0.62, 16, 3, shade(c, 0.55));
  }
}

function mailboxes(g: G, x: number, y: number, cols: number, rows: number, cw: number, ch: number) {
  rr(g, x - 4, y - 4, cols * cw + 8, rows * ch + 8, WOOD_D, 3);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    rect(g, x + c * cw + 2, y + r * ch + 2, cw - 4, ch - 4, 0x5b4630);
    if ((r * 3 + c * 5) % 3 !== 0) {
      rect(g, x + c * cw + 5, y + r * ch + ch - 12, cw - 10, 9, WHITE);
      rect(g, x + c * cw + cw - 11, y + r * ch + ch - 11, 4, 4, JUICE[(r + c) % JUICE.length]);
    }
  }
}

function door(g: G, x: number, fy: number, w: number, h: number, c: number,
  o: { window?: 'round' | 'rect'; reader?: boolean; plate?: number } = {}) {
  rect(g, x - 5, fy - h - 5, w + 10, h + 5, shade(c, 0.6)); rr(g, x, fy - h, w, h, c, 2);
  g.lineStyle(2, shade(c, 0.8));
  if (!o.window) g.strokeRect(x + 8, fy - h + 10, w - 16, h * 0.36);
  g.strokeRect(x + 8, fy - h * 0.46, w - 16, h * 0.38);
  circ(g, x + w - 9, fy - h * 0.5, 3.5, 0xe9c46a);
  if (o.window === 'round') { circ(g, x + w / 2, fy - h + 30, 15, shade(c, 0.6)); circ(g, x + w / 2, fy - h + 30, 11, GLASS); }
  if (o.window === 'rect') { rr(g, x + 12, fy - h + 12, w - 24, h * 0.32, shade(c, 0.6), 3); rr(g, x + 15, fy - h + 15, w - 30, h * 0.32 - 6, GLASS, 2); }
  if (o.plate !== undefined) rr(g, x + w / 2 - 19, fy - h + 54, 38, 10, o.plate, 2);
  if (o.reader) {
    const ry = fy - h * 0.66;
    rr(g, x + w + 13, ry, 17, 26, INK, 3); circ(g, x + w + 21.5, ry + 7, 3, 0x4ade80); rr(g, x + w + 16, ry + 13, 11, 9, 0x9aa5b1, 2);
  }
}

function plant(g: G, x: number, fy: number) {
  oval(g, x + 11, fy - 36, 14, 36, 0x4c9f70); oval(g, x + 2, fy - 29, 12, 26, 0x5fb37f); oval(g, x + 20, fy - 29, 12, 26, 0x3f8f63);
  rr(g, x, fy - 18, 22, 18, 0xc8553d, 3); rect(g, x - 2, fy - 20, 26, 5, 0xa8432f);
}

function board(g: G, x: number, y: number, w: number, h: number, bg = WHITE, pen = 0x4ea8de) {
  rr(g, x - 4, y - 4, w + 8, h + 8, STEEL_D, 3); rect(g, x, y, w, h, bg);
  const bw = Math.min(30, (w - 40) / 3);
  for (let i = 0; i < 3; i++) {
    const bx = x + 10 + i * (bw + 12);
    g.lineStyle(2, pen); g.strokeRect(bx, y + 10, bw, 16);
    if (i < 2) line(g, bx + bw + 1, y + 18, bx + bw + 11, y + 18, pen, 2);
  }
  const soft = mix(bg, pen, 0.45);
  rect(g, x + 10, y + 36, w * 0.62, 3, soft); rect(g, x + 10, y + 45, w * 0.45, 3, soft); rect(g, x + 10, y + 54, w * 0.55, 3, soft);
  rect(g, x + w * 0.3, y + h + 4, w * 0.4, 3, STEEL_D);
}

function win(g: G, x: number, y: number, w: number, h: number) {
  rr(g, x - 4, y - 4, w + 8, h + 8, WHITE, 3); rect(g, x, y, w, h, 0xbfe3f5);
  oval(g, x + w * 0.3, y + h * 0.35, w * 0.4, h * 0.2, WHITE, 0.8);
  rect(g, x + w / 2 - 2, y, 4, h, WHITE); rect(g, x, y + h / 2 - 2, w, 4, WHITE); rect(g, x - 7, y + h + 4, w + 14, 5, STEEL);
}

function clipboard(g: G, x: number, y: number, s = 1) {
  rr(g, x, y, 28 * s, 38 * s, WOOD, 2); rect(g, x + 3 * s, y + 6 * s, 22 * s, 29 * s, WHITE); rr(g, x + 9 * s, y - 3 * s, 10 * s, 7 * s, STEEL_D, 2);
  for (let i = 0; i < 3; i++) {
    const ly = y + (13 + i * 8) * s;
    g.lineStyle(2, 0x2a9d8f); g.lineBetween(x + 5 * s, ly, x + 8 * s, ly + 3 * s); g.lineBetween(x + 8 * s, ly + 3 * s, x + 12 * s, ly - 3 * s);
    rect(g, x + 14 * s, ly - 1, 9 * s, 2, STEEL_D);
  }
}

function plate(g: G, cx: number, y: number, c: number) {
  oval(g, cx, y - 3, 32, 9, WHITE); oval(g, cx, y - 6, 15, 7, c); circ(g, cx + 4, y - 9, 2.2, 0x4c9f70);
}

function bowl(g: G, cx: number, y: number, c: number) {
  g.fillStyle(c, 1); g.slice(cx, y - 13, 13, 0, Math.PI, false); g.fillPath(); rect(g, cx - 14, y - 15, 28, 3, shade(c, 0.8));
}

function hooks(g: G, x: number, y: number, colors: number[]) {
  rect(g, x, y, colors.length * 34 + 6, 5, WOOD_D);
  colors.forEach((c, i) => {
    const hx = x + 8 + i * 34;
    circ(g, hx + 11, y + 4, 3, INK); rr(g, hx, y + 6, 22, 46, c, 7); rect(g, hx + 8, y + 6, 6, 12, shade(c, 0.82));
    rect(g, hx + 4, y + 30, 14, 2, shade(c, 0.8));
  });
}

function sofa(g: G, x: number, fy: number, w: number, c: number) {
  rect(g, x + 6, fy - 6, 6, 6, INK); rect(g, x + w - 12, fy - 6, 6, 6, INK);
  rr(g, x, fy - 50, w, 34, shade(c, 0.85), 9); rr(g, x - 7, fy - 32, w + 14, 27, c, 9);
  line(g, x + w / 2, fy - 30, x + w / 2, fy - 8, shade(c, 0.8), 2);
}

function heatLamp(g: G, x: number, y: number, drop: number) {
  line(g, x, y, x, y + drop, INK, 2);
  g.fillStyle(0xffe08a, 0.22); g.fillTriangle(x, y + drop + 4, x - 24, y + drop + 62, x + 24, y + drop + 62);
  g.fillStyle(0xd1495b, 1); g.fillTriangle(x - 13, y + drop + 14, x + 13, y + drop + 14, x, y + drop - 4);
}

function cuttingBoard(g: G, x: number, y: number) {
  rr(g, x, y - 5, 46, 5, 0xd9a05b, 2); circ(g, x + 10, y - 11, 6, 0xe76f51); circ(g, x + 23, y - 10, 5, 0x84a59d);
  rect(g, x + 32, y - 8, 16, 3, STEEL); rect(g, x + 46, y - 8, 9, 3, INK);
}

function clock(g: G, cx: number, cy: number) {
  circ(g, cx, cy, 13, INK); circ(g, cx, cy, 11, WHITE); line(g, cx, cy, cx, cy - 7, INK, 2); line(g, cx, cy, cx + 5, cy + 1, INK, 2);
}

function printer(g: G, x: number, y: number) {
  rect(g, x + 7, y - 28, 26, 9, WHITE); rr(g, x, y - 21, 40, 21, 0xdfe4ea, 3); rect(g, x + 6, y - 8, 28, 3, INK); circ(g, x + 34, y - 15, 2, 0x4ade80);
}

function toolbox(g: G, x: number, fy: number) {
  g.lineStyle(3, INK); g.strokeRect(x + 13, fy - 29, 16, 8);
  rr(g, x, fy - 22, 42, 22, 0xd1495b, 3); rect(g, x, fy - 13, 42, 2, 0x9c2f3f); rect(g, x + 17, fy - 15, 8, 6, 0xe9c46a);
}

function mug(g: G, x: number, y: number) { rr(g, x, y - 12, 11, 12, WHITE, 2); g.lineStyle(2, WHITE); g.strokeCircle(x + 12, y - 6, 3.5); }

// ---------- rooms ----------

/** Wall and floor of one room. */
export function drawShell(g: G, theme: ThemeId, W: number, H: number, wall: number, floor: number, floorH: number) {
  const fy = H - floorH;
  rect(g, 0, 0, W, H, wall);
  if (theme === 'kitchen') {
    g.lineStyle(1, shade(wall, 0.93), 1);
    for (let x = 22; x < W; x += 22) g.lineBetween(x, fy - 66, x, fy);
    for (let y = fy - 66; y < fy; y += 22) g.lineBetween(0, y, W, y);
  } else if (theme === 'lab') {
    rect(g, 0, fy - 44, W, 4, shade(wall, 0.9));
  } else {
    rect(g, 0, fy - 46, W, 46, shade(wall, 0.95)); rect(g, 0, fy - 48, W, 3, shade(wall, 0.86));
  }
  rect(g, 0, fy, W, floorH, floor);
  if (theme === 'kitchen') {
    for (let x = 0, i = 0; x < W; x += 17, i++) {
      rect(g, x, fy + (i % 2 ? 0 : floorH / 2), Math.min(17, W - x), floorH / 2, mix(floor, 0xffffff, 0.3));
    }
  } else {
    rect(g, 0, fy, W, 4, mix(floor, 0xffffff, 0.3));
    for (let x = 40; x < W; x += 80) line(g, x, fy + 5, x - 12, H, shade(floor, 0.9), 1);
  }
  rect(g, 0, fy - 5, W, 5, shade(wall, 0.78));
}

/** Draws the furniture for one room and returns where ambient particles should come from. */
export function drawFurniture(g: G, theme: ThemeId, room: Room, W: number, fy: number): Emitter[] {
  const em: Emitter[] = [];
  const bubble = (x: number, y: number, color = 0xffffff) => em.push({ kind: 'bubble', x, y, color });
  const steam = (x: number, y: number) => em.push({ kind: 'steam', x, y, color: 0xffffff });
  const frost = (x: number, y: number) => em.push({ kind: 'frost', x, y, color: 0xffffff });
  const top = 52; // below the room sign

  if (theme === 'lab') switch (room) {
    case 'lobby': {
      door(g, 26, fy, 60, 112, 0x7d8fa3, { window: 'rect' }); plant(g, 104, fy);
      board(g, 156, top + 4, 176, 70);
      cabinet(g, 372, fy, 330, 60, 0xe6edf2, STEEL);
      flask(g, 388, fy - 60, 0x2a9d8f, 1.2); flask(g, 424, fy - 60, 0xe76f51); beaker(g, 458, fy - 60, 0x4ea8de);
      tubeRack(g, 492, fy - 60, 6); microscope(g, 566, fy - 60); beaker(g, 626, fy - 60, 0xe9c46a); flask(g, 656, fy - 60, 0x7b6fd0, 1.1);
      bubble(401, fy - 100, 0x2a9d8f); bubble(435, fy - 92, 0xe76f51); bubble(668, fy - 96, 0x7b6fd0);
      wallShelf(g, 392, top + 28, 150, STEEL_D); bottles(g, 394, top + 28, 146, 2);
      win(g, 740, top + 6, 84, 62); win(g, 850, top + 6, 84, 62);
      table(g, 760, fy, 150, 50, STEEL, STEEL_D); tubeRack(g, 776, fy - 50, 5); petri(g, 850, fy - 50, 0xf28482); petri(g, 882, fy - 50, 0x84a59d);
      plant(g, W - 40, fy);
      break;
    }
    case 'screens': {
      cabinet(g, 14, fy, 196, 60, 0xe6edf2, STEEL); microscope(g, 28, fy - 60);
      const s = monitor(g, 96, fy - 60, 96, 62, 0x0f2f36);
      for (const [cx, cy, r] of [[22, 18, 11], [52, 34, 14], [72, 14, 8], [30, 42, 7]]) {
        circ(g, s.x + cx, s.y + cy, r, 0x2a9d8f, 0.9); circ(g, s.x + cx + 2, s.y + cy - 1, r * 0.4, 0xb7f0e2, 0.9);
      }
      rect(g, 228, top + 4, 54, 68, WHITE); rect(g, 232, top + 8, 46, 60, 0xcdeee9);
      circ(g, 248, top + 28, 9, 0x7b6fd0, 0.8); circ(g, 264, top + 48, 11, 0xf28482, 0.8); circ(g, 244, top + 54, 5, 0xe9c46a);
      plant(g, W - 40, fy);
      break;
    }
    case 'api': {
      hatch(g, 24, top + 6, 124, 52, STEEL_D, 0xfef6d8);
      rr(g, 34, top + 40, 44, 16, 0x8ecae6, 3); rr(g, 94, top + 40, 44, 16, 0xa7d7a0, 3);
      g.fillStyle(0x1d6fa5, 1); g.fillTriangle(48, top + 24, 64, top + 24, 56, top + 36);
      g.fillStyle(0x2f855a, 1); g.fillTriangle(108, top + 36, 124, top + 36, 116, top + 24);
      tubeRack(g, 36, top + 58, 4); tubeRack(g, 98, top + 58, 4);
      table(g, 176, fy, 136, 56, STEEL, STEEL_D); box(g, 186, fy - 56, 40, 24, 0x8ecae6); tubeRack(g, 236, fy - 56, 5); petri(g, 296, fy - 56, 0xf28482);
      clipboard(g, 190, top + 2); clipboard(g, 228, top + 2); clock(g, 290, top + 16);
      break;
    }
    case 'database': {
      freezer(g, 14, fy, 88, 116, 4); freezer(g, 110, fy, 88, 116, 4);
      frost(58, fy - 116); frost(154, fy - 116);
      tank(g, 214, fy); tank(g, 250, fy); frost(228, fy - 58);
      rr(g, 292, top + 6, 12, 46, WHITE, 6); rr(g, 296, top + 30, 4, 18, 0x4ea8de, 2); circ(g, 298, top + 48, 4, 0x4ea8de);
      for (const [sx, sy] of [[222, top + 14], [258, top + 30], [236, top + 46]]) {
        line(g, sx - 6, sy, sx + 6, sy, 0x8ecae6, 2); line(g, sx, sy - 6, sx, sy + 6, 0x8ecae6, 2);
        line(g, sx - 4, sy - 4, sx + 4, sy + 4, 0x8ecae6, 1); line(g, sx - 4, sy + 4, sx + 4, sy - 4, 0x8ecae6, 1);
      }
      break;
    }
    case 'login': {
      door(g, 42, fy, 66, 116, 0x6c7a89, { window: 'rect', reader: true });
      rr(g, 20, fy - 3, 110, 3, 0xe9c46a, 1);
      hooks(g, 176, top + 8, [WHITE, WHITE, 0xdcebf5]);
      box(g, 190, fy, 46, 26, STEEL); box(g, 246, fy, 40, 34, 0x8ecae6);
      break;
    }
    case 'tests': {
      table(g, 14, fy, 206, 60, STEEL, STEEL_D);
      flask(g, 30, fy - 60, 0x2a9d8f, 1.25); flask(g, 70, fy - 60, 0xe76f51, 1.25);
      bubble(44, fy - 102, 0x2a9d8f); bubble(84, fy - 102, 0xe76f51);
      tubeRack(g, 114, fy - 60, 6); petri(g, 196, fy - 60, 0xe9c46a);
      clipboard(g, 232, top + 4, 1.25); clipboard(g, 276, top + 4, 1.25);
      box(g, 240, fy, 60, 30, STEEL);
      break;
    }
    case 'setup': {
      shelfUnit(g, 14, fy, 206, 120, 3, STEEL_D, (sx, sy, sw, i) => bottles(g, sx, sy, sw, i * 4));
      bubble(60, fy - 124, 0x4ea8de);
      box(g, 232, fy, 48, 36); box(g, 238, fy - 36, 36, 26, 0xe9c46a); box(g, 286, fy, 32, 28, 0x8ecae6);
      break;
    }
  }

  if (theme === 'kitchen') switch (room) {
    case 'lobby': {
      door(g, 26, fy, 60, 112, 0x9c6644, { window: 'round' });
      board(g, 124, top + 4, 150, 68, 0x2f3e46, 0xf1faee);
      line(g, 330, top + 2, 720, top + 2, INK, 4);
      for (let i = 0; i < 7; i++) pan(g, 356 + i * 56, top + 2);
      cabinet(g, 320, fy, 420, 58, 0xf3eee3, WOOD);
      cuttingBoard(g, 338, fy - 58); bowl(g, 420, fy - 58, 0xe76f51); bowl(g, 456, fy - 58, 0x2a9d8f);
      cuttingBoard(g, 500, fy - 58); pot(g, 590, fy - 58, 0x8d99ae, 40); bowl(g, 668, fy - 58, 0xe9c46a); bottles(g, 690, fy - 58, 48, 1);
      steam(610, fy - 88);
      fridge(g, 772, fy, 72, 120); win(g, 872, top + 6, 90, 62);
      crate(g, 880, fy, 60, 36, 0xe76f51);
      break;
    }
    case 'screens': {
      heatLamp(g, 60, 40, 12); heatLamp(g, 126, 40, 12); heatLamp(g, 192, 40, 12);
      cabinet(g, 14, fy, 228, 58, 0xf3eee3, STEEL);
      plate(g, 44, fy - 58, 0xe76f51); plate(g, 96, fy - 58, 0xe9c46a); plate(g, 148, fy - 58, 0x84a59d); plate(g, 200, fy - 58, 0xf28482);
      steam(96, fy - 70); steam(200, fy - 70);
      table(g, 254, fy, 60, 50);
      for (let i = 0; i < 6; i++) rr(g, 266, fy - 54 - i * 4, 36, 3, i % 2 ? WHITE : 0xdfe4ea, 1);
      wallShelf(g, 252, top + 40, 62); bottles(g, 254, top + 40, 60, 3);
      break;
    }
    case 'api': {
      hatch(g, 26, top + 6, 152, 62, WOOD_D, 0xffe8b8);
      tickets(g, 34, top + 12, 136, 5);
      bell(g, 150, top + 68); plate(g, 60, top + 68, 0xe76f51); plate(g, 104, top + 68, 0x84a59d);
      steam(60, top + 54);
      table(g, 206, fy, 106, 56); pot(g, 216, fy - 56, 0xd1495b, 30); plate(g, 284, fy - 56, 0xe9c46a);
      rr(g, 226, top + 6, 60, 40, WHITE, 3);
      for (let i = 0; i < 4; i++) rect(g, 232, top + 13 + i * 8, 40 - (i % 2) * 10, 3, STEEL_D);
      break;
    }
    case 'database': {
      fridge(g, 14, fy, 76, 122);
      shelfUnit(g, 100, fy, 152, 122, 3, WOOD_D, (sx, sy, sw, i) => bottles(g, sx, sy, sw, i * 3 + 1));
      crate(g, 262, fy, 54, 36, 0xe9c46a); sack(g, 272, fy - 36);
      frost(52, fy - 122);
      break;
    }
    case 'login': {
      door(g, 44, fy, 68, 118, 0x2a9d8f, { window: 'round', plate: WHITE });
      rr(g, 28, fy - 3, 100, 3, 0xd1495b, 1);
      hooks(g, 176, top + 8, [0xd1495b, WHITE, 0xe9c46a]);
      crate(g, 196, fy, 56, 30); box(g, 262, fy, 44, 36);
      break;
    }
    case 'tests': {
      stove(g, 14, fy, 116, 64); pot(g, 22, fy - 67, 0x8d99ae, 38); pot(g, 82, fy - 67, 0xd1495b, 34);
      steam(41, fy - 96); steam(99, fy - 96);
      line(g, 160, top + 2, 300, top + 2, INK, 4); pan(g, 180, top + 2); pan(g, 222, top + 2); pan(g, 264, top + 2);
      table(g, 150, fy, 160, 54); bowl(g, 180, fy - 54, 0xe76f51); bowl(g, 224, fy - 54, 0xe9c46a); bowl(g, 268, fy - 54, 0x84a59d);
      line(g, 196, fy - 66, 206, fy - 82, STEEL_D, 3); line(g, 240, fy - 66, 250, fy - 82, STEEL_D, 3);
      break;
    }
    case 'setup': {
      crate(g, 14, fy, 66, 44, 0xe76f51); crate(g, 20, fy - 44, 54, 36, 0x84a59d);
      box(g, 92, fy, 56, 40); box(g, 98, fy - 40, 44, 28, 0xe9c46a);
      sack(g, 158, fy); sack(g, 196, fy);
      wallShelf(g, 150, top + 44, 92); bottles(g, 152, top + 44, 88, 2);
      door(g, 256, fy, 54, 112, 0x9c6644, {});
      break;
    }
  }

  if (theme === 'office') switch (room) {
    case 'lobby': {
      door(g, 26, fy, 60, 112, 0x5c677d, { window: 'rect' }); plant(g, 104, fy);
      sofa(g, 150, fy, 150, 0x8ecae6); clock(g, 224, top + 20);
      board(g, 350, top + 4, 180, 70);
      cabinet(g, 570, fy, 230, 54, WOOD, INK);
      const s = monitor(g, 610, fy - 54, 70, 46, 0x1d3557);
      rect(g, s.x + 6, s.y + 8, 30, 4, 0x8ecae6); rect(g, s.x + 6, s.y + 18, 44, 4, 0x8ecae6); rect(g, s.x + 6, s.y + 28, 22, 4, 0x8ecae6);
      mug(g, 720, fy - 54); steam(725, fy - 70);
      win(g, 840, top + 6, 84, 62); plant(g, W - 40, fy);
      break;
    }
    case 'screens': {
      table(g, 14, fy, 180, 58);
      const s = monitor(g, 44, fy - 58, 110, 66, WHITE);
      circ(g, s.x + 24, s.y + 22, 13, 0xe76f51); rect(g, s.x + 48, s.y + 10, 30, 22, 0x4ea8de);
      g.fillStyle(0xe9c46a, 1); g.fillTriangle(s.x + 20, s.y + 54, s.x + 44, s.y + 54, s.x + 32, s.y + 36);
      rect(g, s.x + 56, s.y + 40, 40, 5, STEEL_D); rect(g, s.x + 56, s.y + 49, 28, 5, STEEL_D);
      rr(g, 208, top + 2, 70, 70, WHITE, 3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rr(g, 214 + c * 20, top + 8 + r * 20, 16, 16, JUICE[(r * 3 + c) % JUICE.length], 2);
      plant(g, W - 40, fy);
      break;
    }
    case 'api': {
      mailboxes(g, 20, top + 6, 5, 3, 34, 24);
      table(g, 204, fy, 110, 54); box(g, 214, fy - 54, 40, 28);
      rect(g, 266, fy - 60, 34, 6, WHITE); rect(g, 268, fy - 66, 34, 6, 0xf1e3c4); rect(g, 264, fy - 72, 34, 6, WHITE);
      box(g, 24, fy, 50, 34); box(g, 84, fy, 38, 26, 0xe9c46a);
      break;
    }
    case 'database': {
      filingCabinet(g, 14, fy, 70, 112, 0x8d99ae, 3); filingCabinet(g, 90, fy, 70, 112, 0x7f8ea3, 3); filingCabinet(g, 166, fy, 70, 78, 0x8d99ae, 2);
      box(g, 174, fy - 78, 52, 26);
      shelfUnit(g, 246, fy, 70, 116, 3, WOOD_D, (sx, sy, sw, i) => binders(g, sx, sy, sw, i * 2));
      break;
    }
    case 'login': {
      door(g, 34, fy, 62, 114, 0x5c677d, { reader: true });
      cabinet(g, 160, fy, 150, 52, WOOD, INK);
      const s = monitor(g, 190, fy - 52, 72, 48, 0x1d3557);
      for (let i = 0; i < 4; i++) rect(g, s.x + 3 + (i % 2) * (s.w / 2), s.y + 3 + Math.floor(i / 2) * (s.h / 2), s.w / 2 - 6, s.h / 2 - 6, 0x457b9d);
      clock(g, 290, top + 16);
      break;
    }
    case 'tests': {
      table(g, 14, fy, 196, 58);
      for (let i = 0; i < 3; i++) {
        box(g, 26 + i * 58, fy - 58, 44, 30, 0xd4a373);
        circ(g, 60 + i * 58, fy - 84, 8, i === 2 ? 0xe9c46a : 0x2a9d8f);
        g.lineStyle(2, WHITE); g.lineBetween(56 + i * 58, fy - 84, 59 + i * 58, fy - 81); g.lineBetween(59 + i * 58, fy - 81, 64 + i * 58, fy - 88);
      }
      clipboard(g, 228, top + 2, 1.5); clipboard(g, 276, top + 12, 1.1);
      break;
    }
    case 'setup': {
      shelfUnit(g, 14, fy, 184, 120, 3, WOOD_D, (sx, sy, sw, i) => boxesRow(g, sx, sy, sw, i * 3));
      toolbox(g, 208, fy); table(g, 256, fy, 60, 48); printer(g, 266, fy - 48);
      break;
    }
  }
  return em;
}

/** Things on the roof, different per theme. Returns a smoke emitter for the kitchen chimney. */
export function drawRoof(g: G, theme: ThemeId, x: number, y: number, w: number, color: number): Emitter[] {
  rect(g, x - 10, y - 14, w + 20, 14, color); rect(g, x - 10, y - 14, w + 20, 4, mix(color, 0xffffff, 0.25));
  if (theme === 'kitchen') {
    rect(g, x + 150, y - 60, 40, 46, 0xb5651d); rect(g, x + 144, y - 66, 52, 9, 0x8a4b14);
    for (let i = 0; i < 3; i++) line(g, x + 150, y - 48 + i * 12, x + 190, y - 48 + i * 12, 0x8a4b14, 1);
    return [{ kind: 'steam', x: x + 170, y: y - 70, color: 0xffffff }];
  }
  if (theme === 'lab') {
    rr(g, x + 140, y - 36, 54, 22, STEEL, 4); for (let i = 0; i < 4; i++) rect(g, x + 148 + i * 11, y - 31, 5, 12, STEEL_D);
    rr(g, x + 220, y - 30, 30, 16, STEEL, 4);
    line(g, x + w - 180, y - 14, x + w - 180, y - 44, INK, 3);
    g.fillStyle(STEEL, 1); g.slice(x + w - 180, y - 46, 18, Math.PI * 0.15, Math.PI * 1.15, false); g.fillPath();
    return [];
  }
  rr(g, x + 150, y - 34, 60, 20, STEEL, 3); rect(g, x + 158, y - 28, 44, 3, STEEL_D); rect(g, x + 158, y - 22, 44, 3, STEEL_D);
  line(g, x + w - 170, y - 14, x + w - 170, y - 62, INK, 3); line(g, x + w - 182, y - 50, x + w - 158, y - 50, INK, 2);
  circ(g, x + w - 170, y - 64, 4, 0xd1495b);
  return [];
}
