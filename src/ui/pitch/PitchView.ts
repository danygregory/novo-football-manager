import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

export const PITCH_W = 960;
export const PITCH_H = 560;
const MARGIN = 26;

interface Dot {
  box: Container;
  tx: number;
  ty: number;
}

const toHex = (css: string) => parseInt(css.replace('#', ''), 16);

/** Campo 2D em PixiJS: desenha o gramado, os 22 jogadores e a bola, com movimento suavizado. */
export class PitchView {
  private app = new Application();
  private ready = false;
  private destroyed = false;
  private dots = new Map<string, Dot>();
  private layer = new Container();
  private ball = new Container();
  private ballTarget = { x: PITCH_W / 2, y: PITCH_H / 2 };
  private labelStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } });

  constructor(private host: HTMLElement) {}

  async init(): Promise<void> {
    await this.app.init({ width: PITCH_W, height: PITCH_H, background: 0x2f7a45, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.app.canvas.style.borderRadius = '10px';
    this.drawPitch();
    this.app.stage.addChild(this.layer);
    const ballG = new Graphics().circle(1, 2, 7).fill({ color: 0x000000, alpha: 0.25 }).circle(0, 0, 7).fill(0xffffff).stroke({ color: 0x222222, width: 1.5 });
    this.ball.addChild(ballG);
    this.ball.position.set(PITCH_W / 2, PITCH_H / 2);
    this.app.stage.addChild(this.ball);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.ready = true;
  }

  private drawPitch(): void {
    const g = new Graphics();
    const x0 = MARGIN, y0 = MARGIN, w = PITCH_W - 2 * MARGIN, h = PITCH_H - 2 * MARGIN;
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      g.rect(x0 + (w / stripes) * i, y0, w / stripes, h).fill(i % 2 ? 0x2f7a45 : 0x34824a);
    }
    const line = { color: 0xffffff, width: 2, alpha: 0.85 };
    g.rect(x0, y0, w, h).stroke(line);
    g.moveTo(x0 + w / 2, y0).lineTo(x0 + w / 2, y0 + h).stroke(line);
    g.circle(x0 + w / 2, y0 + h / 2, 58).stroke(line);
    for (const dir of [0, 1]) {
      const bx = dir === 0 ? x0 : x0 + w;
      const s = dir === 0 ? 1 : -1;
      g.rect(dir === 0 ? bx : bx - 150, y0 + h / 2 - 150, 150, 300).stroke(line);
      g.rect(dir === 0 ? bx : bx - 52, y0 + h / 2 - 72, 52, 144).stroke(line);
      g.rect(dir === 0 ? bx - 10 : bx, y0 + h / 2 - 40, 10, 80).stroke({ color: 0xffffff, width: 3 });
      g.circle(bx + s * 105, y0 + h / 2, 3).fill(0xffffff);
    }
    this.app.stage.addChild(g);
  }

  private px(x: number, y: number): { x: number; y: number } {
    return { x: MARGIN + x * (PITCH_W - 2 * MARGIN), y: MARGIN + y * (PITCH_H - 2 * MARGIN) };
  }

  /** Define os jogadores em campo (posições alvo em 0..1). `teams` traz cor e nome curto de cada jogador. */
  setPlayers(
    players: { id: string; label: string; x: number; y: number; color: string; border: string; keeper: boolean }[],
  ): void {
    if (!this.ready) return;
    const alive = new Set(players.map((p) => p.id));
    for (const [id, d] of this.dots) {
      if (!alive.has(id)) {
        d.box.destroy({ children: true });
        this.dots.delete(id);
      }
    }
    for (const p of players) {
      const pos = this.px(p.x, p.y);
      let d = this.dots.get(p.id);
      if (!d) {
        const box = new Container();
        const circle = new Graphics().circle(0, 0, 11).fill(toHex(p.keeper ? '#f2c744' : p.color)).stroke({ color: toHex(p.border), width: 2.5 });
        const label = new Text({ text: p.label, style: this.labelStyle });
        label.anchor.set(0.5, 0);
        label.position.set(0, 13);
        box.addChild(circle, label);
        box.position.set(pos.x, pos.y);
        this.layer.addChild(box);
        d = { box, tx: pos.x, ty: pos.y };
        this.dots.set(p.id, d);
      }
      d.tx = pos.x;
      d.ty = pos.y;
    }
  }

  setBall(x: number, y: number): void {
    this.ballTarget = this.px(x, y);
  }

  private tick(dt: number): void {
    const k = 1 - Math.exp(-dt / 220);
    for (const d of this.dots.values()) {
      d.box.x += (d.tx - d.box.x) * k;
      d.box.y += (d.ty - d.box.y) * k;
    }
    const kb = 1 - Math.exp(-dt / 140);
    this.ball.x += (this.ballTarget.x - this.ball.x) * kb;
    this.ball.y += (this.ballTarget.y - this.ball.y) * kb;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.ready) {
      this.app.destroy(true, { children: true });
      this.ready = false;
    }
  }
}
