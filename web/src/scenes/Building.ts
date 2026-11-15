import Phaser from 'phaser';
import type { BuildEvent, Room, ThemeId } from '../../../shared/events.ts';
import { ROOMS } from '../../../shared/events.ts';
import { AGENT_COLORS, ROOM_NAMES } from '../../../shared/themes.ts';
import { THEME_STYLES } from '../themes/index.ts';

export const WIDTH = 1200;
export const HEIGHT = 760;

const PAD = 30;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const GAP = 16;
// Cutaway building: floor 2 = screens/api/database, floor 1 = login/tests/setup, ground = lobby.
const LAYOUT: Record<Room, { col: number; row: number; span: number }> = {
  screens: { col: 0, row: 0, span: 1 }, api: { col: 1, row: 0, span: 1 }, database: { col: 2, row: 0, span: 1 },
  login: { col: 0, row: 1, span: 1 }, tests: { col: 1, row: 1, span: 1 }, setup: { col: 2, row: 1, span: 1 },
  lobby: { col: 0, row: 2, span: 3 },
};

export function roomRect(room: Room) {
  const colW = (WIDTH - PAD * 2 - GAP * 2) / 3;
  const rowH = (HEIGHT - PAD * 2 - GAP * 2) / 3;
  const l = LAYOUT[room];
  return new Phaser.Geom.Rectangle(PAD + l.col * (colW + GAP), PAD + l.row * (rowH + GAP), colW * l.span + GAP * (l.span - 1), rowH);
}

interface Agent {
  id: string; source: BuildEvent['source']; room: Room; slot: number;
  body: Phaser.GameObjects.Container; bubble: Phaser.GameObjects.Container; hand: Phaser.GameObjects.Text;
  bubbleTimer?: Phaser.Time.TimerEvent; workTween?: Phaser.Tweens.Tween;
}

export interface SceneOptions { theme: ThemeId; reducedMotion: boolean; colorSafe: boolean }

export class BuildingScene extends Phaser.Scene {
  opts: SceneOptions = { theme: 'lab', reducedMotion: false, colorSafe: false };
  private roomLayer!: Phaser.GameObjects.Container;
  private glows = new Map<Room, Phaser.GameObjects.Rectangle>();
  private agents = new Map<string, Agent>();

  constructor() { super('building'); }

  preload() {
    // Generated art is optional: missing files fall back to flat colors.
    // assets/manifest.json lists the files that exist, e.g. ["lab/api.png", "common/char-claude.png"].
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
    this.roomLayer = this.add.container(0, 0);
    this.drawRooms();
  }

  setOptions(o: Partial<SceneOptions>) {
    const themeChanged = o.theme && o.theme !== this.opts.theme;
    this.opts = { ...this.opts, ...o };
    if (themeChanged && this.roomLayer) this.drawRooms();
    for (const a of this.agents.values()) this.tintAgent(a);
  }

  private drawRooms() {
    this.roomLayer.removeAll(true);
    this.glows.clear();
    const t = THEME_STYLES[this.opts.theme];
    this.cameras.main.setBackgroundColor(t.sky);
    this.roomLayer.add(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH - PAD, HEIGHT - PAD, t.wall).setStrokeStyle(4, t.floor));

    for (const room of ROOMS) {
      const r = roomRect(room);
      const key = `${this.opts.theme}-${room}`;
      const hasArt = this.textures.exists(key) && this.textures.get(key).key !== '__MISSING';
      if (hasArt) {
        const img = this.add.image(r.centerX, r.centerY, key);
        img.setDisplaySize(r.width, r.height);
        if (room === 'lobby') img.setCrop(0, img.height * 0.33, img.width, img.height * 0.34).setDisplaySize(r.width, r.height * 3);
        this.roomLayer.add(img);
      } else {
        this.roomLayer.add(this.add.rectangle(r.centerX, r.centerY, r.width, r.height, t.rooms[room]));
        this.roomLayer.add(this.add.text(r.right - 14, r.top + 10, t.emoji[room], { fontSize: '34px' }).setOrigin(1, 0));
      }
      // Floor strip where characters stand
      this.roomLayer.add(this.add.rectangle(r.centerX, r.bottom - 10, r.width, 20, t.floor, 0.85));
      // Room sign is drawn in code (translatable, dyslexia font friendly)
      const sign = this.add.text(r.left + 12, r.top + 10, ROOM_NAMES[this.opts.theme][room], {
        fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: t.text,
        backgroundColor: 'rgba(255,255,255,0.85)', padding: { x: 8, y: 4 },
      });
      this.roomLayer.add(sign);
      const glow = this.add.rectangle(r.centerX, r.centerY, r.width, r.height).setStrokeStyle(6, 0xffc83d).setAlpha(0);
      this.glows.set(room, glow);
      this.roomLayer.add(glow);
    }
    this.roomLayer.sendToBack(this.roomLayer);
    this.children.sendToBack(this.roomLayer);
  }

  private color(source: BuildEvent['source']) {
    const c = AGENT_COLORS[source];
    return Phaser.Display.Color.HexStringToColor(this.opts.colorSafe ? c.safe : c.normal).color;
  }

  private spot(a: Agent) {
    const r = roomRect(a.room);
    const inRoom = [...this.agents.values()].filter((x) => x.room === a.room);
    const i = Math.max(0, inRoom.indexOf(a));
    const x = r.left + 70 + ((i * 110 + a.slot * 37) % Math.max(80, r.width - 140));
    return { x, y: r.bottom - 52 };
  }

  private getAgent(e: BuildEvent): Agent {
    let a = this.agents.get(e.agentId);
    if (a) return a;
    const body = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 34, 46, 12, 0x000000, 0.2);
    const torso = this.add.rectangle(0, 14, 40, 34, 0xffffff).setName('torso');
    const head = this.add.circle(0, -16, 22, 0xffffff).setName('head');
    const eyes = this.add.text(0, -18, '• •', { fontSize: '16px', color: '#1b1b1b' }).setOrigin(0.5);
    const antenna = this.add.rectangle(0, -44, 4, 12, 0x333333);
    const name = this.add.text(0, 46, AGENT_COLORS[e.source].name + (e.agentId.includes('helper') ? ' helper' : ''), {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 0);
    body.add([shadow, torso, head, eyes, antenna, name]);
    const hand = this.add.text(26, -56, '✋', { fontSize: '30px' }).setVisible(false);
    body.add(hand);
    const bubble = this.add.container(0, 0).setVisible(false);
    a = { id: e.agentId, source: e.source, room: 'lobby', slot: this.agents.size, body, bubble, hand };
    this.agents.set(e.agentId, a);
    this.tintAgent(a);
    const p = this.spot(a);
    body.setPosition(p.x, p.y);
    if (!this.opts.reducedMotion) { body.setScale(0); this.tweens.add({ targets: body, scale: 1, duration: 400, ease: 'Back.out' }); }
    return a;
  }

  private tintAgent(a: Agent) {
    const c = this.color(a.source);
    (a.body.getByName('torso') as Phaser.GameObjects.Rectangle).setFillStyle(c);
    (a.body.getByName('head') as Phaser.GameObjects.Arc).setFillStyle(c);
  }

  /** Called for every BuildEvent. */
  handleEvent(e: BuildEvent) {
    const a = this.getAgent(e);
    a.hand.setVisible(e.kind === 'waiting_for_user');
    const moved = a.room !== e.room;
    a.room = e.room;
    const p = this.spot(a);
    if (this.opts.reducedMotion) {
      a.body.setPosition(p.x, p.y);
    } else if (moved) {
      this.tweens.add({ targets: a.body, x: p.x, y: p.y, duration: 650, ease: 'Sine.inOut' });
      this.tweens.add({ targets: a.body, angle: { from: -6, to: 6 }, duration: 160, yoyo: true, repeat: 1, onComplete: () => a.body.setAngle(0) });
    }
    this.flashRoom(e.room);
    this.work(a, e);
    this.say(a, e.summary, p);
  }

  private work(a: Agent, e: BuildEvent) {
    a.workTween?.stop();
    a.body.setY(this.spot(a).y);
    if (this.opts.reducedMotion || e.kind === 'done' || e.kind === 'waiting_for_user') return;
    a.workTween = this.tweens.add({ targets: a.body, y: '-=6', duration: 220, yoyo: true, repeat: 4, delay: 650 });
  }

  private flashRoom(room: Room) {
    const g = this.glows.get(room);
    if (!g) return;
    this.tweens.killTweensOf(g);
    g.setAlpha(1);
    this.tweens.add({ targets: g, alpha: 0, duration: this.opts.reducedMotion ? 10 : 2600, delay: 600 });
  }

  private say(a: Agent, text: string, p: { x: number; y: number }) {
    a.bubble.removeAll(true);
    const t = this.add.text(0, 0, text.length > 60 ? text.slice(0, 57) + '…' : text, {
      fontFamily: FONT, fontSize: '15px', color: '#111', wordWrap: { width: 220 }, align: 'center',
    }).setOrigin(0.5);
    const bg = this.add.rectangle(0, 0, t.width + 18, t.height + 12, 0xffffff).setStrokeStyle(2, 0x333333);
    a.bubble.add([bg, t]);
    a.bubble.setPosition(Phaser.Math.Clamp(p.x, 130, WIDTH - 130), p.y - 92).setVisible(true).setDepth(10);
    a.bubbleTimer?.remove();
    a.bubbleTimer = this.time.delayedCall(3500, () => a.bubble.setVisible(false));
  }

  reset() {
    for (const a of this.agents.values()) { a.body.destroy(); a.bubble.destroy(); }
    this.agents.clear();
  }
}
