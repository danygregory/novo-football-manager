// Sem isso o Pixi compila os sincronizadores de shader com `new Function`, o que exigiria 'unsafe-eval' na CSP.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FIELD_H, FIELD_W } from './choreo';

export const PITCH_W = 960;
export const PITCH_H = 600;
const MARGIN = 28;

export interface DotMeta {
  id: string;
  label: string;
  color: string;
  border: string;
  keeper: boolean;
}

interface Dot {
  box: Container;
  body: Graphics;
  meta: DotMeta;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  vr: number;
  life: number;
}

const toHex = (css: string) => parseInt(css.replace('#', ''), 16);

/** Campo 2D em PixiJS. Só desenha: as posições (em metros) vêm do coreógrafo (ou de um replay gravado). */
export class PitchView {
  private app = new Application();
  private ready = false;
  private destroyed = false;
  private dots = new Map<string, Dot>();
  private layer = new Container();
  private ballShadow = new Graphics();
  private ball = new Graphics();
  private fx = new Container();
  private nets: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private netRipple: [number, number] = [0, 0];
  private particles: Particle[] = [];
  private labelStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } });
  private reduced = false;
  /** Rótulo "REPLAY" e similares desenhados pelo próprio campo. */
  private banner = new Text({ text: '', style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 30, fontWeight: '800', fill: 0xf2c744, stroke: { color: 0x000000, width: 5 } }) });
  /** Marca d'água que só aparece nos clipes gravados. */
  private mark = new Text({ text: 'NOVO Football Manager', style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } }) });
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private recordedMime = '';
  private lastTick = 0;
  private debug = new Graphics();
  private debugOn = false;

  constructor(private host: HTMLElement) {}

  async init(): Promise<void> {
    await this.app.init({ width: PITCH_W, height: PITCH_H, background: 0x2f7a45, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.app.canvas.setAttribute('role', 'img');
    this.app.canvas.setAttribute('aria-label', 'Campo de jogo em 2D; a narração da partida está ao lado, em texto');
    this.host.appendChild(this.app.canvas);
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.drawPitch();
    this.app.stage.addChild(this.nets[0], this.nets[1]);
    this.app.stage.addChild(this.layer);
    this.ball.circle(0, 0, 6.5).fill(0xffffff).stroke({ color: 0x222222, width: 1.5 });
    this.ballShadow.circle(0, 0, 6).fill({ color: 0x000000, alpha: 0.28 });
    this.app.stage.addChild(this.debug);
    this.app.stage.addChild(this.ballShadow, this.ball, this.fx);
    this.banner.anchor.set(0.5);
    this.banner.position.set(PITCH_W / 2, 52);
    this.banner.visible = false;
    this.app.stage.addChild(this.banner);
    this.mark.anchor.set(1, 1);
    this.mark.position.set(PITCH_W - 14, PITCH_H - 10);
    this.mark.alpha = 0.85;
    this.mark.visible = false;
    this.app.stage.addChild(this.mark);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.ready = true;
  }

  setReducedMotion(v: boolean): void {
    this.reduced = v;
  }

  private drawPitch(): void {
    const g = new Graphics();
    const x0 = MARGIN, y0 = MARGIN, w = PITCH_W - 2 * MARGIN, h = PITCH_H - 2 * MARGIN;
    const stripes = 14;
    for (let i = 0; i < stripes; i++) g.rect(x0 + (w / stripes) * i, y0, w / stripes, h).fill(i % 2 ? 0x2f7a45 : 0x34824a);
    const line = { color: 0xffffff, width: 2, alpha: 0.85 };
    g.rect(x0, y0, w, h).stroke(line);
    g.moveTo(x0 + w / 2, y0).lineTo(x0 + w / 2, y0 + h).stroke(line);
    g.circle(x0 + w / 2, y0 + h / 2, (9.15 / FIELD_W) * w).stroke(line);
    g.circle(x0 + w / 2, y0 + h / 2, 3).fill(0xffffff);
    const pw = (16.5 / FIELD_W) * w, ph = (40.3 / FIELD_H) * h, gw = (5.5 / FIELD_W) * w, gh = (18.3 / FIELD_H) * h;
    for (const dir of [0, 1]) {
      const bx = dir === 0 ? x0 : x0 + w;
      g.rect(dir === 0 ? bx : bx - pw, y0 + h / 2 - ph / 2, pw, ph).stroke(line);
      g.rect(dir === 0 ? bx : bx - gw, y0 + h / 2 - gh / 2, gw, gh).stroke(line);
      g.circle(dir === 0 ? bx + (11 / FIELD_W) * w : bx - (11 / FIELD_W) * w, y0 + h / 2, 3).fill(0xffffff);
    }
    this.app.stage.addChild(g);
    // redes
    const goalH = (7.32 / FIELD_H) * h;
    const depth = 16;
    [0, 1].forEach((i) => {
      const net = this.nets[i] as Graphics;
      const xEdge = i === 0 ? x0 : x0 + w;
      const x1 = i === 0 ? xEdge - depth : xEdge + depth;
      net.clear();
      for (let k = 0; k <= 6; k++) net.moveTo(xEdge, y0 + h / 2 - goalH / 2 + (goalH / 6) * k).lineTo(x1, y0 + h / 2 - goalH / 2 + (goalH / 6) * k);
      for (let k = 0; k <= 3; k++) net.moveTo(xEdge + (x1 - xEdge) * (k / 3), y0 + h / 2 - goalH / 2).lineTo(xEdge + (x1 - xEdge) * (k / 3), y0 + h / 2 + goalH / 2);
      net.stroke({ color: 0xffffff, width: 1, alpha: 0.45 });
      net.rect(Math.min(xEdge, x1), y0 + h / 2 - goalH / 2, depth, goalH).stroke({ color: 0xffffff, width: 3, alpha: 0.9 });
    });
  }

  /** Metros -> pixels. */
  px(x: number, y: number): { x: number; y: number } {
    return { x: MARGIN + (x / FIELD_W) * (PITCH_W - 2 * MARGIN), y: MARGIN + (y / FIELD_H) * (PITCH_H - 2 * MARGIN) };
  }

  /** Cria/remove os marcadores conforme quem está em campo. */
  setMeta(list: DotMeta[]): void {
    if (!this.ready) return;
    const alive = new Set(list.map((m) => m.id));
    for (const [id, d] of this.dots) {
      if (!alive.has(id)) {
        d.box.destroy({ children: true });
        this.dots.delete(id);
      }
    }
    for (const m of list) {
      const old = this.dots.get(m.id);
      if (old) {
        old.meta = m;
        continue;
      }
      const box = new Container();
      const body = new Graphics().circle(0, 0, 10.5).fill(toHex(m.keeper ? '#f2c744' : m.color)).stroke({ color: toHex(m.border), width: 2.5 });
      const label = new Text({ text: m.label, style: this.labelStyle });
      label.anchor.set(0.5, 0);
      label.position.set(0, 12);
      box.addChild(body, label);
      this.layer.addChild(box);
      this.dots.set(m.id, { box, body, meta: m });
    }
  }

  /** Desenha uma foto: posições em metros por id e a bola. */
  draw(pos: Map<string, { x: number; y: number }>, ball: { x: number; y: number; z: number }): void {
    if (!this.ready) return;
    for (const [id, d] of this.dots) {
      const p = pos.get(id);
      if (!p) continue;
      const q = this.px(p.x, p.y);
      d.box.position.set(q.x, q.y);
    }
    const b = this.px(ball.x, ball.y);
    this.ball.position.set(b.x, b.y - ball.z * 3.2);
    this.ballShadow.position.set(b.x + ball.z * 1.4, b.y + 2);
    this.ballShadow.scale.set(1 + ball.z * 0.06);
  }

  /** Sobreposição de depuração (tecla D): alvo e vetor de velocidade de cada jogador. */
  setDebug(on: boolean): void {
    this.debugOn = on;
    if (!on) this.debug.clear();
  }

  get debugging(): boolean {
    return this.debugOn;
  }

  drawDebug(list: { x: number; y: number; tx: number; ty: number; vx: number; vy: number; pressing: boolean; side: 0 | 1 }[]): void {
    if (!this.ready || !this.debugOn) return;
    const g = this.debug;
    g.clear();
    for (const a of list) {
      const p = this.px(a.x, a.y);
      const t = this.px(a.tx, a.ty);
      const color = a.pressing ? 0xff4d4d : a.side === 0 ? 0xffe066 : 0x9ad1ff;
      g.moveTo(p.x, p.y).lineTo(t.x, t.y).stroke({ color, width: 1, alpha: 0.55 });
      g.circle(t.x, t.y, 3).fill({ color, alpha: 0.8 });
      const v = this.px(a.x + a.vx * 0.5, a.y + a.vy * 0.5);
      g.moveTo(p.x, p.y).lineTo(v.x, v.y).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    }
  }

  setBanner(text: string): void {
    this.banner.text = text;
    this.banner.visible = text.length > 0;
  }

  // ---------- clipe ----------

  /** O navegador sabe gravar o canvas? (MediaRecorder + captureStream) */
  static canRecord(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  /** Começa a gravar o campo (com a marca d'água). Devolve false se não dá para gravar aqui. */
  startRecording(): boolean {
    if (!this.ready || this.recorder || !PitchView.canRecord()) return false;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    try {
      const stream = this.app.canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 3_000_000 });
      this.chunks = [];
      this.recordedMime = rec.mimeType || mime || 'video/webm';
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      rec.start(250);
      this.recorder = rec;
      this.mark.visible = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Encerra a gravação e devolve o vídeo (ou nada, se não gravou). */
  stopRecording(): Promise<Blob | undefined> {
    const rec = this.recorder;
    this.recorder = undefined;
    this.mark.visible = false;
    if (!rec || rec.state === 'inactive') return Promise.resolve(undefined);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: this.recordedMime }) : undefined);
      try {
        rec.stop();
      } catch {
        resolve(undefined);
      }
    });
  }

  // ---------- efeitos ----------

  netRippleFor(side: 0 | 1): void {
    this.netRipple[side] = this.reduced ? 0 : 1;
  }

  confetti(colors: string[], side: 0 | 1): void {
    if (this.reduced || !this.ready) return;
    const cx = side === 0 ? PITCH_W * 0.78 : PITCH_W * 0.22;
    for (let i = 0; i < 110; i++) {
      const g = new Graphics().rect(-3, -2, 6, 4).fill(toHex(colors[i % colors.length] as string));
      g.position.set(cx + (Math.random() - 0.5) * 160, PITCH_H * 0.35);
      this.fx.addChild(g);
      this.particles.push({ g, vx: (Math.random() - 0.5) * 260, vy: -140 - Math.random() * 260, vr: (Math.random() - 0.5) * 12, life: 1.6 + Math.random() * 1.0 });
    }
  }

  private tick(dt: number): void {
    const s = dt / 1000;
    this.lastTick += s;
    for (const i of [0, 1] as const) {
      const r = this.netRipple[i];
      if (r > 0) {
        const net = this.nets[i] as Graphics;
        net.scale.x = 1 + Math.sin(this.lastTick * 40) * 0.12 * r;
        net.pivot.x = 0;
        net.position.x = i === 0 ? (1 - net.scale.x) * MARGIN : (1 - net.scale.x) * (PITCH_W - MARGIN);
        this.netRipple[i] = Math.max(0, r - s * 1.4);
        if (this.netRipple[i] === 0) {
          net.scale.x = 1;
          net.position.x = 0;
        }
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life -= s;
      p.vy += 520 * s;
      p.g.x += p.vx * s;
      p.g.y += p.vy * s;
      p.g.rotation += p.vr * s;
      p.g.alpha = Math.max(0, Math.min(1, p.life));
      if (p.life <= 0) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = undefined;
    if (this.ready) {
      this.app.destroy(true, { children: true });
      this.ready = false;
    }
  }
}
