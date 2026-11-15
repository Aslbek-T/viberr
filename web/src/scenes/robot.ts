import Phaser from 'phaser';
import { mix, shade } from './furniture.ts';

export type Pose = 'idle' | 'walk' | 'hello' | 'think' | 'type' | 'read' | 'press' | 'tube' | 'wave' | 'jump' | 'shake';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DARK = 0x2b303a;
const SHOULDER_X = 21, SHOULDER_Y = -56, ARM = 25;

/**
 * A small robot drawn with shapes: head, body, two arms, two legs. `root` sits at the robot's feet.
 * Poses are driven from update() with sine waves, so there are no tweens to clean up.
 */
export class Robot {
  root: Phaser.GameObjects.Container;
  pose: Pose = 'idle';
  poseTime = 0;
  private rig: Phaser.GameObjects.Container;
  private legL: Phaser.GameObjects.Graphics; private legR: Phaser.GameObjects.Graphics;
  private armL: Phaser.GameObjects.Graphics; private armR: Phaser.GameObjects.Graphics;
  private torso: Phaser.GameObjects.Graphics; private head: Phaser.GameObjects.Graphics;
  private prop: Phaser.GameObjects.Graphics;
  private mark: Phaser.GameObjects.Container; private markBg: Phaser.GameObjects.Arc; private markText: Phaser.GameObjects.Text;
  private color = 0xffffff;
  private t = Math.random() * 10;
  private propColor = 0x4ea8de;

  constructor(scene: Phaser.Scene, name: string, color: number) {
    const g = () => scene.add.graphics();
    this.legL = g().setPosition(-9, -24); this.legR = g().setPosition(9, -24);
    this.armL = g().setPosition(-SHOULDER_X, SHOULDER_Y); this.armR = g().setPosition(SHOULDER_X, SHOULDER_Y);
    this.torso = g(); this.head = g().setPosition(0, -82); this.prop = g();
    this.rig = scene.add.container(0, 0, [this.prop, this.legL, this.legR, this.armL, this.torso, this.head, this.armR]);
    this.markBg = scene.add.circle(0, 0, 15, 0xffffff).setStrokeStyle(2, DARK);
    this.markText = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#1b1b1b' }).setOrigin(0.5);
    this.mark = scene.add.container(24, -124, [this.markBg, this.markText]).setVisible(false);
    const shadow = scene.add.ellipse(0, 1, 48, 11, 0x000000, 0.22);
    const label = scene.add.text(0, 5, name, {
      fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff', backgroundColor: 'rgba(20,24,32,0.78)', padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 0);
    this.root = scene.add.container(0, 0, [shadow, this.rig, this.mark, label]);
    this.setColor(color);
  }

  setColor(c: number) {
    this.color = c;
    const d = shade(c, 0.72), l = mix(c, 0xffffff, 0.5);
    for (const leg of [this.legL, this.legR]) {
      leg.clear(); leg.fillStyle(d, 1); leg.fillRoundedRect(-4.5, 0, 9, 22, 3); leg.fillStyle(DARK, 1); leg.fillRoundedRect(-6, 19, 14, 6, 3);
    }
    for (const arm of [this.armL, this.armR]) {
      arm.clear(); arm.fillStyle(d, 1); arm.fillRoundedRect(-4, -3, 8, ARM + 1, 4); arm.fillStyle(l, 1); arm.fillCircle(0, ARM, 5);
    }
    const t = this.torso; t.clear();
    t.fillStyle(DARK, 1); t.fillRect(-5, -68, 10, 8);
    t.fillStyle(c, 1); t.fillRoundedRect(-18, -62, 36, 40, 9);
    t.fillStyle(l, 1); t.fillRoundedRect(-11, -55, 22, 15, 4);
    t.fillStyle(DARK, 0.55); t.fillCircle(-5, -47.5, 2.2); t.fillRect(0, -49, 7, 3);
    const h = this.head; h.clear();
    h.lineStyle(3, DARK, 1); h.lineBetween(0, -16, 0, -26); h.fillStyle(l, 1); h.fillCircle(0, -28, 4.5);
    h.fillStyle(d, 1); h.fillRoundedRect(-25, -6, 6, 12, 2); h.fillRoundedRect(19, -6, 6, 12, 2);
    h.fillStyle(c, 1); h.fillRoundedRect(-21, -16, 42, 32, 10);
    h.fillStyle(0x1f2430, 1); h.fillRoundedRect(-15, -9, 30, 17, 6);
    h.fillStyle(0xffffff, 1); h.fillCircle(-7, 0, 3.5); h.fillCircle(7, 0, 3.5);
  }

  /** `tone` colors the thing in the robot's hand (the test tube liquid). */
  setPose(p: Pose, tone?: number, restart = false) {
    if (p === this.pose && tone === undefined && !restart) return;
    this.pose = p; this.poseTime = 0;
    if (tone !== undefined) this.propColor = tone;
    this.drawProp();
    const marks: Partial<Record<Pose, [string, number]>> = { wave: ['✋', 0xfff3bf], shake: ['!', 0xffd0c7], think: ['…', 0xffffff] };
    const m = marks[p];
    this.mark.setVisible(!!m);
    if (m) { this.markText.setText(m[0]).setColor(p === 'shake' ? '#b42318' : '#1b1b1b'); this.markBg.setFillStyle(m[1]); }
  }

  face(dir: 1 | -1) { this.rig.setScale(dir, 1); }

  private drawProp() {
    const g = this.prop; g.clear(); g.setPosition(0, 0);
    switch (this.pose) {
      case 'type': // a little standing desk with a screen
        g.fillStyle(DARK, 1); g.fillRect(40, -45, 5, 45); g.fillRoundedRect(31, -4, 23, 4, 2);
        g.fillStyle(0xaab4c0, 1); g.fillRoundedRect(24, -49, 36, 6, 2);
        g.fillStyle(DARK, 1); g.fillRoundedRect(38, -80, 26, 24, 3); g.fillRect(49, -57, 4, 9);
        g.fillStyle(0x9be7ff, 1); g.fillRoundedRect(40, -78, 22, 20, 2);
        g.fillStyle(0x1f6f8b, 1); g.fillRect(43, -74, 12, 2); g.fillRect(43, -69, 16, 2); g.fillRect(43, -64, 9, 2);
        break;
      case 'press': // a control panel with three buttons
        g.fillStyle(DARK, 1); g.fillRect(50, -42, 5, 42); g.fillRoundedRect(41, -4, 23, 4, 2);
        g.fillStyle(0x4a5361, 1); g.fillRoundedRect(40, -80, 26, 40, 4);
        g.fillStyle(0xe76f51, 1); g.fillCircle(53, -71, 4.5); g.fillStyle(0xe9c46a, 1); g.fillCircle(53, -60, 4.5);
        g.fillStyle(0x4ade80, 1); g.fillCircle(53, -49, 4.5);
        break;
      case 'read': // a clipboard, held in the hand
        g.fillStyle(0xb98a5e, 1); g.fillRoundedRect(-10, -25, 20, 27, 2);
        g.fillStyle(0xffffff, 1); g.fillRect(-7, -20, 14, 19);
        g.fillStyle(0x8795a3, 1); g.fillRect(-4, -28, 8, 5); g.fillRect(-5, -16, 10, 2); g.fillRect(-5, -11, 10, 2); g.fillRect(-5, -6, 6, 2);
        break;
      case 'tube': // a test tube, held up
        g.fillStyle(0xd8eef7, 1); g.fillRoundedRect(-4, -27, 8, 29, 4);
        g.fillStyle(this.propColor, 1); g.fillRoundedRect(-3, -13, 6, 14, 3);
        g.fillStyle(0x8795a3, 1); g.fillRect(-5, -28, 10, 3);
        break;
    }
  }

  /** Advance the animation. With `still` (reduced motion) the robot holds one fixed pose. */
  update(dt: number, still: boolean) {
    this.t += dt; this.poseTime += dt;
    const t = still ? 0 : this.t;
    let lL = 0, lR = 0, aL = 0, aR = 0, ry = 0, rx = 0, hd = 0;
    switch (this.pose) {
      case 'walk': {
        const s = Math.sin(t * 14);
        lL = s * 0.6; lR = -s * 0.6; aL = -s * 0.5; aR = s * 0.5; ry = -Math.abs(Math.cos(t * 14)) * 3.5;
        break;
      }
      case 'hello': aR = -(Math.PI - 0.5) + Math.sin(t * 9) * 0.35; if (this.poseTime > 1.6) this.setPose('idle'); break;
      case 'think': aR = -2.3; hd = -0.1 + Math.sin(t * 1.8) * 0.05; ry = Math.sin(t * 2) * 1; break;
      case 'type': aR = -1.15 + Math.sin(t * 24) * 0.17; aL = -0.95 + Math.cos(t * 24) * 0.17; hd = 0.06; break;
      case 'read': aR = -1.35; aL = -0.25; hd = 0.14 + Math.sin(t * 2.4) * 0.06; break;
      case 'press': aR = -1.0 - ((Math.sin(t * 8) + 1) / 2) * 0.55; aL = 0.12; break;
      case 'tube': aR = -2.35 + Math.sin(t * 10) * 0.13; aL = 0.15; hd = -0.12; break;
      case 'wave': aR = -(Math.PI - 0.3) + Math.sin(t * 6) * 0.3; ry = Math.sin(t * 2) * 1; break;
      case 'jump':
        aR = -(Math.PI - 0.55); aL = Math.PI - 0.55;
        if (!still && this.poseTime < 1.5) ry = -Math.abs(Math.sin((this.poseTime / 0.5) * Math.PI)) * 22;
        if (this.poseTime > 2.4) this.setPose('idle');
        break;
      case 'shake':
        aR = -0.5; aL = 0.5; hd = 0.1;
        if (!still && this.poseTime < 0.9) rx = Math.sin(t * 42) * 4;
        if (this.poseTime > 4) this.setPose('idle');
        break;
      default: ry = Math.sin(t * 2.2) * 1.2;
    }
    this.legL.rotation = lL; this.legR.rotation = lR; this.armL.rotation = aL; this.armR.rotation = aR;
    this.head.rotation = hd; this.rig.setPosition(rx, ry);
    if (this.pose === 'read' || this.pose === 'tube') {
      this.prop.setPosition(SHOULDER_X + ARM * Math.sin(-aR), SHOULDER_Y + ARM * Math.cos(aR));
    }
  }

  setAlpha(a: number) { this.root.setAlpha(a); }
  destroy() { this.root.destroy(); }
}
