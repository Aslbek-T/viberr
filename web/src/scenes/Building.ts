import Phaser from 'phaser';
import type { BuildEvent, Room, ThemeId } from '../../../shared/events.ts';
import { ROOMS } from '../../../shared/events.ts';
import { AGENT_COLORS, ROOM_MEANING, ROOM_NAMES } from '../../../shared/themes.ts';
import { stats } from '../session.ts';
import { THEME_STYLES } from '../themes/index.ts';
import { drawFurniture, drawRoof, drawShell, mix, shade, type Emitter } from './furniture.ts';
import { Robot, type Pose } from './robot.ts';

// World size in design pixels. The canvas is rendered at RES times this so it stays sharp when the
// browser scales it up; the camera zooms by RES, so all scene code keeps using design pixels.
export const WIDTH = 1200;
export const HEIGHT = 760;
export const RES = 2;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SIDE = 30, TOP = 86, BOTTOM = 18, GAP = 12, SHAFT = 62, FLOOR_H = 24;
const COL_W = (WIDTH - SIDE * 2 - SHAFT - GAP * 3) / 3;
const ROW_H = (HEIGHT - TOP - BOTTOM - GAP * 2) / 3;
const SHAFT_LEFT = SIDE + 3 * (COL_W + GAP);
const SHAFT_X = SHAFT_LEFT + SHAFT / 2;
const ROBOT_SCALE = 0.8;

// Cutaway building: floor 2 = screens/api/database, floor 1 = login/tests/setup, ground = lobby.
// A ladder shaft on the right edge connects the floors.
const LAYOUT: Record<Room, { col: number; row: number; span: number }> = {
  screens: { col: 0, row: 0, span: 1 }, api: { col: 1, row: 0, span: 1 }, database: { col: 2, row: 0, span: 1 },
  login: { col: 0, row: 1, span: 1 }, tests: { col: 1, row: 1, span: 1 }, setup: { col: 2, row: 1, span: 1 },
  lobby: { col: 0, row: 2, span: 3 },
};

export function roomRect(room: Room) {
  const l = LAYOUT[room];
  return new Phaser.Geom.Rectangle(SIDE + l.col * (COL_W + GAP), TOP + l.row * (ROW_H + GAP), COL_W * l.span + GAP * (l.span - 1), ROW_H);
}
/** Where a robot's feet are on a given floor (row 0 is the top floor). */
const feetY = (row: number) => TOP + row * (ROW_H + GAP) + ROW_H - FLOOR_H + 13;

type Pt = { x: number; y: number };
interface Agent {
  id: string; source: BuildEvent['source']; room: Room; spot: number;
  robot: Robot; path: Pt[]; speed: number; arrive: { pose: Pose; tone?: number };
  bubble: Phaser.GameObjects.Container; bubbleTimer?: Phaser.Time.TimerEvent;
}
interface Meter { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; x: number; y: number }

export interface SceneOptions { theme: ThemeId; reducedMotion: boolean; colorSafe: boolean }

export class BuildingScene extends Phaser.Scene {
  opts: SceneOptions = { theme: 'lab', reducedMotion: false, colorSafe: false };
  private ready = false;
  private early: BuildEvent[] = [];
  private world!: Phaser.GameObjects.Container;
  private glows = new Map<Room, Phaser.GameObjects.Rectangle>();
  private meters = new Map<Room, Meter>();
  private emitters: Emitter[] = [];
  private particleTimer?: Phaser.Time.TimerEvent;
  private tip!: Phaser.GameObjects.Container;
  private agents = new Map<string, Agent>();

  constructor() { super('building'); }

  preload() {
    // Optional generated art. assets/manifest.json lists the files that exist, e.g. ["lab/api.png"].
    this.load.json('manifest', 'assets/manifest.json');
    this.load.once('filecomplete-json-manifest', (_k: string, _t: string, files: string[]) => {
      for (const f of files ?? []) {
        const [theme, name] = f.replace(/\.png$/, '').split('/');
        if ((['lab', 'kitchen', 'office'] as string[]).includes(theme) && (ROOMS as string[]).includes(name)) {
          this.load.image(`${theme}-${name}`, `assets/${f}`);
        }
      }
    });
  }

  create() {
    this.cameras.main.setOrigin(0, 0).setZoom(RES);
    this.world = this.add.container(0, 0).setDepth(1);
    this.tip = this.add.container(0, 0).setDepth(20).setVisible(false);
    this.drawWorld();
    this.ready = true;
    for (const e of this.early.splice(0)) this.handleEvent(e);
  }

  setOptions(o: Partial<SceneOptions>) {
    const themeChanged = !!o.theme && o.theme !== this.opts.theme;
    this.opts = { ...this.opts, ...o };
    if (!this.ready) return;
    if (themeChanged) this.drawWorld();
    for (const a of this.agents.values()) a.robot.setColor(this.color(a.source));
  }

  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
    return this.add.text(x, y, s, { fontFamily: FONT, ...style }).setResolution(RES);
  }

  // ---------------------------------------------------------------- drawing

  private drawWorld() {
    const theme = this.opts.theme;
    const t = THEME_STYLES[theme];
    this.world.removeAll(true);
    this.tip.setVisible(false);
    this.glows.clear(); this.meters.clear(); this.emitters = [];
    this.particleTimer?.remove();

    // Sky that follows the real time of day, with a sun or a moon.
    const hour = new Date().getHours();
    const night = hour >= 19 || hour < 6;
    const sky = this.add.graphics();
    const [skyTop, skyLow] = night ? [0x1b2442, 0x4b5a86] : [mix(t.sky, 0x8ecae6, 0.55), t.sky];
    sky.fillGradientStyle(skyTop, skyTop, skyLow, skyLow, 1);
    sky.fillRect(0, 0, WIDTH, HEIGHT);
    if (night) {
      sky.fillStyle(0xfdf6d8, 1); sky.fillCircle(WIDTH - 110, 40, 17);
      sky.fillStyle(skyTop, 1); sky.fillCircle(WIDTH - 102, 35, 15);
      sky.fillStyle(0xffffff, 0.85);
      for (const [x, y, r] of [[80, 22, 1.4], [210, 48, 1], [420, 18, 1.6], [560, 44, 1], [700, 26, 1.3], [880, 52, 1], [980, 16, 1.5]]) sky.fillCircle(x, y, r);
    } else {
      sky.fillStyle(0xffd166, 1); sky.fillCircle(WIDTH - 110, 40, 18);
      sky.fillStyle(0xffffff, 0.9);
      for (const [x, y] of [[120, 36], [640, 26]]) { sky.fillEllipse(x, y, 70, 20); sky.fillEllipse(x + 24, y - 9, 44, 20); }
    }
    this.world.add(sky);

    // Building body, roof and ground
    const body = this.add.graphics();
    const bx = SIDE - 10, bw = WIDTH - SIDE * 2 + 20;
    body.fillStyle(shade(t.wall, 0.82), 1); body.fillRect(0, HEIGHT - BOTTOM + 6, WIDTH, BOTTOM);
    body.fillStyle(t.wall, 1); body.fillRect(bx, TOP - 10, bw, HEIGHT - TOP - BOTTOM + 16);
    body.lineStyle(3, shade(t.wall, 0.7), 1); body.strokeRect(bx, TOP - 10, bw, HEIGHT - TOP - BOTTOM + 16);
    this.world.add(body);
    for (const em of drawRoof(body, theme, bx, TOP - 10, bw, shade(t.wall, 0.7))) this.emitters.push(em);

    this.drawShaft(t.wall, t.floor);
    for (const room of ROOMS) this.drawRoom(room);

    this.particleTimer = this.time.addEvent({ delay: 170, loop: true, callback: () => this.spawnParticle() });
  }

  /** The ladder shaft robots use to change floors. */
  private drawShaft(wall: number, floor: number) {
    const g = this.add.graphics();
    const top = TOP, bottom = HEIGHT - BOTTOM;
    g.fillStyle(shade(wall, 0.62), 1); g.fillRect(SHAFT_LEFT, top, SHAFT, bottom - top);
    for (let row = 0; row < 3; row++) {
      const fy = TOP + row * (ROW_H + GAP) + ROW_H - FLOOR_H;
      g.fillStyle(floor, 1); g.fillRect(SHAFT_LEFT, fy, SHAFT, row === 2 ? FLOOR_H : 5);
    }
    const lx = SHAFT_X - 13, rx = SHAFT_X + 13, ly0 = TOP + ROW_H - FLOOR_H - 34, ly1 = bottom - FLOOR_H;
    g.lineStyle(4, 0xe9c46a, 1); g.lineBetween(lx, ly0, lx, ly1); g.lineBetween(rx, ly0, rx, ly1);
    g.lineStyle(3, 0xd9a441, 1);
    for (let y = ly0 + 10; y < ly1; y += 16) g.lineBetween(lx, y, rx, y);
    this.world.add(g);
  }

  private drawRoom(room: Room) {
    const theme = this.opts.theme;
    const t = THEME_STYLES[theme];
    const r = roomRect(room);
    const key = `${theme}-${room}`;

    if (this.textures.exists(key)) {
      const img = this.add.image(r.centerX, r.centerY, key).setDisplaySize(r.width, r.height);
      this.world.add(img);
    } else {
      const g = this.add.graphics().setPosition(r.x, r.y);
      drawShell(g, theme, r.width, r.height, t.rooms[room], t.floor, FLOOR_H);
      for (const em of drawFurniture(g, theme, room, r.width, r.height - FLOOR_H)) {
        this.emitters.push({ ...em, x: r.x + em.x, y: r.y + em.y });
      }
      this.world.add(g);
    }

    // Room sign: drawn in code so it can be translated and follows the font setting.
    this.world.add(this.text(r.left + 10, r.top + 9, ROOM_NAMES[theme][room], {
      fontSize: '17px', fontStyle: 'bold', color: t.text, backgroundColor: 'rgba(255,255,255,0.92)', padding: { x: 8, y: 4 },
    }));

    // "Built" meter: fills a little with every file made in this room.
    const mx = r.right - 124, my = r.top + 9;
    const meter: Meter = { g: this.add.graphics(), label: this.text(mx + 8, my + 4, '', { fontSize: '12px', fontStyle: 'bold', color: '#1f2937' }), x: mx, y: my };
    this.world.add([meter.g, meter.label]);
    this.meters.set(room, meter);
    this.updateMeter(room);

    const glow = this.add.rectangle(r.centerX, r.centerY, r.width, r.height).setStrokeStyle(5, 0xffc83d).setAlpha(0);
    this.glows.set(room, glow);
    this.world.add(glow);

    // Hover: what this room means, and what has been built here.
    const zone = this.add.zone(r.x, r.y, r.width, r.height).setOrigin(0).setInteractive();
    const tip = (p: Phaser.Input.Pointer) => this.showTip(room, p.worldX, p.worldY);
    zone.on('pointerover', tip);
    zone.on('pointermove', tip);
    zone.on('pointerout', () => this.tip.setVisible(false));
    this.world.add(zone);
  }

  private updateMeter(room: Room, pulse = false) {
    const m = this.meters.get(room);
    if (!m) return;
    const s = stats.rooms[room];
    const fill = s.edits === 0 ? 0 : 1 - Math.pow(0.7, s.edits);
    const w = 114, barW = w - 16;
    m.g.clear();
    m.g.fillStyle(0xffffff, 0.92); m.g.fillRoundedRect(m.x, m.y, w, 36, 6);
    m.g.fillStyle(0xd5dbe3, 1); m.g.fillRoundedRect(m.x + 8, m.y + 23, barW, 7, 3);
    if (fill > 0) { m.g.fillStyle(0x16a34a, 1); m.g.fillRoundedRect(m.x + 8, m.y + 23, Math.max(7, barW * fill), 7, 3); }
    const n = s.files.length;
    m.label.setText(n === 0 ? 'Nothing built yet' : `${n} ${n === 1 ? 'file' : 'files'} built`);
    if (pulse && !this.opts.reducedMotion) {
      this.tweens.add({ targets: m.label, scale: { from: 1.18, to: 1 }, duration: 320, ease: 'Sine.out' });
    }
  }

  private showTip(room: Room, x: number, y: number) {
    const s = stats.rooms[room];
    const lines = [`${ROOM_NAMES[this.opts.theme][room]}: ${ROOM_MEANING[room]}`];
    if (s.files.length) {
      lines.push('Built here:', ...s.files.slice(-6).map((f) => `• ${f}`));
      if (s.files.length > 6) lines.push(`…and ${s.files.length - 6} more`);
    } else lines.push('Nothing built here yet.');
    this.tip.removeAll(true);
    const txt = this.text(10, 8, lines.join('\n'), { fontSize: '13px', color: '#ffffff', wordWrap: { width: 280 }, lineSpacing: 3 });
    const bg = this.add.rectangle(0, 0, txt.width + 20, txt.height + 16, 0x141820, 0.94).setOrigin(0);
    this.tip.add([bg, txt]);
    this.tip.setPosition(Phaser.Math.Clamp(x + 14, 4, WIDTH - bg.width - 4), Phaser.Math.Clamp(y + 16, 4, HEIGHT - bg.height - 4)).setVisible(true);
  }

  // ---------------------------------------------------------------- ambient particles

  private spawnParticle() {
    if (this.opts.reducedMotion || !this.emitters.length) return;
    const em = Phaser.Utils.Array.GetRandom(this.emitters);
    const x = em.x + Phaser.Math.Between(-4, 4);
    if (em.kind === 'bubble') {
      const o = this.add.circle(x, em.y, Phaser.Math.FloatBetween(2, 4), mix(em.color, 0xffffff, 0.35), 0.85).setDepth(3);
      this.tweens.add({ targets: o, y: em.y - Phaser.Math.Between(26, 44), alpha: 0, duration: 1500, onComplete: () => o.destroy() });
    } else if (em.kind === 'steam') {
      const o = this.add.ellipse(x, em.y, 11, 8, 0xffffff, 0.55).setDepth(3);
      this.tweens.add({ targets: o, y: em.y - 42, x: x + Phaser.Math.Between(-10, 10), scale: 2, alpha: 0, duration: 1900, onComplete: () => o.destroy() });
    } else {
      const o = this.add.circle(x + Phaser.Math.Between(-22, 22), em.y, Phaser.Math.FloatBetween(1.5, 2.6), 0xffffff, 0.9).setDepth(3);
      this.tweens.add({ targets: o, y: em.y + Phaser.Math.Between(18, 34), alpha: 0, duration: 1700, onComplete: () => o.destroy() });
    }
  }

  // ---------------------------------------------------------------- agents

  private color(source: BuildEvent['source']) {
    const c = AGENT_COLORS[source];
    return Phaser.Display.Color.HexStringToColor(this.opts.colorSafe ? c.safe : c.normal).color;
  }

  /** A free standing place in the agent's room, so robots don't stand on top of each other. */
  private place(a: Agent): Pt {
    const r = roomRect(a.room);
    const taken = new Set([...this.agents.values()].filter((x) => x !== a && x.room === a.room).map((x) => x.spot));
    let i = 0;
    while (taken.has(i)) i++;
    a.spot = i;
    const x = a.room === 'lobby' ? r.left + 300 + i * 150 : r.left + 130 + (i % 3) * 84;
    return { x: Math.min(x, r.right - 80), y: feetY(LAYOUT[a.room].row) };
  }

  private getAgent(e: BuildEvent): Agent {
    let a = this.agents.get(e.agentId);
    if (a) return a;
    const name = AGENT_COLORS[e.source].name + (e.agentId.includes('helper') ? ' helper' : '');
    const robot = new Robot(this, name, this.color(e.source));
    robot.root.setScale(ROBOT_SCALE).setDepth(5);
    robot.root.each((o: Phaser.GameObjects.GameObject) => this.crisp(o));
    const lobby = roomRect('lobby');
    robot.root.setPosition(lobby.left + 56 + this.agents.size * 26, feetY(2)); // comes in through the front door
    a = {
      id: e.agentId, source: e.source, room: 'lobby', spot: -1, robot, path: [], speed: 400,
      arrive: { pose: 'idle' }, bubble: this.add.container(0, 0).setDepth(10).setVisible(false),
    };
    this.agents.set(e.agentId, a);
    return a;
  }

  private crisp(o: Phaser.GameObjects.GameObject) {
    if (o instanceof Phaser.GameObjects.Text) o.setResolution(RES);
    else if (o instanceof Phaser.GameObjects.Container) o.each((c: Phaser.GameObjects.GameObject) => this.crisp(c));
  }

  private poseFor(e: BuildEvent): { pose: Pose; tone?: number } {
    switch (e.kind) {
      case 'session_start': return { pose: 'hello' };
      case 'thinking': return { pose: 'think' };
      case 'file_read': return { pose: 'read' };
      case 'file_edit': return { pose: 'type' };
      case 'shell': return { pose: 'press' };
      case 'test_run': return { pose: 'tube', tone: e.detail?.exitCode ? 0xe5484d : 0x4ade80 };
      case 'waiting_for_user': return { pose: 'wave' };
      case 'user_replied': return { pose: 'hello' };
      case 'error': return { pose: 'shake' };
      case 'done': return { pose: 'jump' };
    }
  }

  /** Called for every BuildEvent. */
  handleEvent(e: BuildEvent) {
    if (!this.ready) { this.early.push(e); return; }
    stats.record(e);
    if (e.kind === 'file_edit') this.updateMeter(e.room, true);

    const a = this.getAgent(e);
    a.room = e.room;
    a.arrive = this.poseFor(e);
    const from = { x: a.robot.root.x, y: a.robot.root.y };
    const to = this.place(a);

    if (this.opts.reducedMotion) {
      a.path = [];
      a.robot.root.setPosition(to.x, to.y);
      a.robot.face(1);
      a.robot.setPose(a.arrive.pose, a.arrive.tone, true);
      if (from.x !== to.x || from.y !== to.y) { a.robot.setAlpha(0.35); this.tweens.add({ targets: a.robot.root, alpha: 1, duration: 250 }); }
    } else {
      // Walk along the floor; to change floors, go to the ladder shaft, climb, then walk to the spot.
      a.path = Math.abs(from.y - to.y) < 2 ? [to] : [{ x: SHAFT_X, y: from.y }, { x: SHAFT_X, y: to.y }, to];
      let len = 0, p = from;
      for (const q of a.path) { len += Math.abs(q.x - p.x) + Math.abs(q.y - p.y); p = q; }
      a.speed = Math.max(380, len / 1.0);
      if (len < 3) { a.path = []; a.robot.setPose(a.arrive.pose, a.arrive.tone, true); }
    }
    this.flashRoom(e.room);
    this.say(a, e.summary);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 100) / 1000;
    for (const a of this.agents.values()) {
      const root = a.robot.root;
      let budget = a.speed * dt;
      while (a.path.length && budget > 0) {
        const q = a.path[0];
        const dx = q.x - root.x, dy = q.y - root.y;
        const d = Math.abs(dx) + Math.abs(dy);
        if (Math.abs(dx) > 1) a.robot.face(dx > 0 ? 1 : -1);
        a.robot.setPose('walk');
        if (d <= budget) {
          root.setPosition(q.x, q.y); budget -= d; a.path.shift();
          if (!a.path.length) { a.robot.face(1); a.robot.setPose(a.arrive.pose, a.arrive.tone, true); }
        } else {
          root.setPosition(root.x + (dx / d) * budget, root.y + (dy / d) * budget);
          budget = 0;
        }
      }
      a.robot.update(dt, this.opts.reducedMotion);
      if (a.bubble.visible) a.bubble.setPosition(Phaser.Math.Clamp(root.x, 130, WIDTH - 130), root.y - 132 * ROBOT_SCALE - 14);
    }
  }

  private flashRoom(room: Room) {
    const g = this.glows.get(room);
    if (!g) return;
    this.tweens.killTweensOf(g);
    g.setAlpha(1);
    this.tweens.add({ targets: g, alpha: 0, duration: this.opts.reducedMotion ? 10 : 2600, delay: 700 });
  }

  private say(a: Agent, text: string) {
    a.bubble.removeAll(true);
    const t = this.text(0, 0, text.length > 64 ? text.slice(0, 61) + '…' : text, {
      fontSize: '13px', color: '#111111', wordWrap: { width: 230 }, align: 'center',
    }).setOrigin(0.5, 1);
    const bg = this.add.rectangle(0, -t.height / 2, t.width + 18, t.height + 10, 0xffffff).setStrokeStyle(2, 0x39424e);
    a.bubble.add([bg, t]);
    a.bubble.setVisible(true);
    a.bubbleTimer?.remove();
    a.bubbleTimer = this.time.delayedCall(3500, () => a.bubble.setVisible(false));
  }

  /** Clears the agents and the build progress, e.g. before a new replay. */
  reset() {
    for (const a of this.agents.values()) { a.robot.destroy(); a.bubble.destroy(); a.bubbleTimer?.remove(); }
    this.agents.clear();
    stats.reset();
    for (const room of ROOMS) this.updateMeter(room);
  }
}
