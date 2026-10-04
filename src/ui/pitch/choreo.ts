import { Rng, hashSeed } from '../../engine/prng';
import type { MatchEvent, Slot, Zone } from '../../engine/types';
import { layoutSide } from './layout';

/**
 * Coreografia da partida: 22 agentes com física própria e uma bola que percorre passes e chutes.
 * É só apresentação. Usa um PRNG próprio (derivado da seed da partida) e nunca altera o resultado do motor.
 * Roda em passo fixo (1/60 s de "tempo de coreografia"); em 4x rodam mais passos por quadro, nunca passos maiores.
 */
export const FIELD_W = 105;
export const FIELD_H = 68;
export const GOAL_HALF = 3.66;
export const STEP = 1 / 60;
/** Fator que acelera as velocidades reais (o relógio da partida é bem mais rápido que o real). */
const ANIM = 3.0;

export interface PlayerBrief {
  id: string;
  name: string;
  side: 0 | 1;
  slot: Slot;
  /** Atributos 1-99. */
  speed: number;
  skill: number;
  iq: number;
  cond: number;
  keeper: boolean;
}

export interface Agent {
  id: string;
  name: string;
  side: 0 | 1;
  slot: Slot;
  keeper: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  /** Posição-base da formação (m), no sentido do ataque do próprio time. */
  bx: number;
  by: number;
  vmax: number;
  accel: number;
  /** Atraso de reação (s): o time não se move como bloco único. */
  lag: number;
  /** Referência suavizada do x da bola, vista do próprio ataque (0..1). */
  focus: number;
  phase: number;
  cond: number;
  skill: number;
  iq: number;
  /** Alvo imposto por uma jogada (receber o passe, chutar). */
  override?: { x: number; y: number; until: number };
}

export type BeatKind = 'pass' | 'shot' | 'hold' | 'setball';
export type ShotOutcome = 'goal' | 'save' | 'hard-save' | 'post' | 'miss' | 'big-miss';

interface Beat {
  kind: BeatKind;
  /** Duração em segundos de coreografia. */
  dur: number;
  to?: string;
  lofted?: boolean;
  /** Chute. */
  side?: 0 | 1;
  outcome?: ShotOutcome;
  /** Bola parada (pênalti, saída). */
  x?: number;
  y?: number;
  holder?: string;
}

interface Job {
  ev?: MatchEvent;
  beats: Beat[];
  /** Índice do beat ao fim do qual o evento "acontece" para a interface (placar, narração). */
  commitAfter: number;
  committed: boolean;
  /** Linhas de narração que crescem com o perigo, emitidas quando a jogada começa. */
  lines?: string[];
}

export interface BallState {
  x: number;
  y: number;
  /** Altura (m), só para o desenho. */
  z: number;
  holder?: string;
  /** Fase atual da bola. */
  mode: 'held' | 'pass' | 'shot' | 'loose';
}

export type Fx =
  | { kind: 'goal'; side: 0 | 1; x: number; y: number }
  | { kind: 'net'; side: 0 | 1 }
  | { kind: 'save'; side: 0 | 1; dive: boolean }
  | { kind: 'post'; side: 0 | 1 }
  | { kind: 'whistle' };

export interface Frame {
  t: number;
  /** Ids na ordem dos pares de `p` (compartilhado entre quadros enquanto o elenco em campo não muda). */
  ids: string[];
  p: number[];
  b: [number, number, number];
}

const attackDir = (side: 0 | 1) => (side === 0 ? 1 : -1);
/** x (m) do ponto de referência de cada zona para o time `side`. */
export function zoneX(side: 0 | 1, zone: Zone): number {
  const f = zone === 'DEF' ? 0.2 : zone === 'MID' ? 0.5 : zone === 'ATT' ? 0.76 : 0.9;
  return (side === 0 ? f : 1 - f) * FIELD_W;
}
export const goalX = (attacking: 0 | 1) => (attacking === 0 ? FIELD_W : 0);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Choreo {
  readonly agents = new Map<string, Agent>();
  readonly ball: BallState = { x: FIELD_W / 2, y: FIELD_H / 2, z: 0, mode: 'loose' };
  /** Segundos de coreografia decorridos. */
  time = 0;
  readonly rng: Rng;
  private queue: Job[] = [];
  private current?: { job: Job; beat: number; t: number; from: { x: number; y: number }; fromZ: number };
  private acc = 0;
  /** Quem tem a posse (time) segundo o último evento; usado pela referência de posicionamento. */
  possession: 0 | 1 = 0;
  zone: Zone = 'MID';
  private tactics: [number, number] = [0.5, 0.5];
  readonly frames: Frame[] = [];
  private frameTick = 0;
  onCommit: (ev: MatchEvent) => void = () => undefined;
  onFx: (fx: Fx) => void = () => undefined;
  /** Narração crescente: linhas emitidas quando a jogada perigosa começa. */
  onLines: (lines: string[], ev: MatchEvent) => void = () => undefined;
  /** Fator de aceleração dos beats (ex.: 2 quando há fila acumulada). */
  private catchUp = 1;

  constructor(seed: number) {
    this.rng = new Rng(hashSeed(`${seed}:anim`));
  }

  // ---------- elencos em campo ----------

  /** Sincroniza os agentes com quem está em campo (substituições entram/saem). */
  setLineups(briefs: PlayerBrief[], tactics: [number, number]): void {
    this.tactics = tactics;
    const alive = new Set(briefs.map((b) => b.id));
    for (const id of [...this.agents.keys()]) if (!alive.has(id)) this.agents.delete(id);
    const bySide: [PlayerBrief[], PlayerBrief[]] = [briefs.filter((b) => b.side === 0), briefs.filter((b) => b.side === 1)];
    ([0, 1] as const).forEach((side) => {
      const lay = layoutSide(bySide[side].map((b) => ({ id: b.id, slot: b.slot })), side, 0.5);
      for (const b of bySide[side]) {
        const p = lay.get(b.id);
        if (!p) continue;
        const bx = p.x * FIELD_W;
        const by = p.y * FIELD_H;
        let a = this.agents.get(b.id);
        if (!a) {
          const r = this.rng;
          a = {
            id: b.id, name: b.name, side, slot: b.slot, keeper: b.keeper,
            x: bx, y: by, vx: 0, vy: 0, tx: bx, ty: by, bx, by,
            vmax: 0, accel: 0, lag: 0.15 + r.next() * 0.55, focus: 0.5, phase: r.next() * Math.PI * 2, cond: b.cond, skill: b.skill, iq: b.iq,
          };
          this.agents.set(b.id, a);
        }
        a.slot = b.slot;
        a.keeper = b.keeper;
        a.bx = bx;
        a.by = by;
        a.cond = b.cond;
        a.skill = b.skill;
        a.iq = b.iq;
        const fatigue = 0.8 + 0.2 * (b.cond / 100);
        a.vmax = (5.5 + (b.speed / 99) * 4.5) * fatigue * ANIM;
        a.accel = (4 + (b.speed / 99) * 4) * fatigue * ANIM;
      }
    });
  }

  // ---------- eventos do motor ----------

  /** Enfileira um evento do motor; a interface só "confirma" o lance (placar, texto) quando a jogada termina. */
  push(ev: MatchEvent, names: (id: string) => string): void {
    const job = this.buildJob(ev, names);
    this.queue.push(job);
  }

  get pending(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  /** Há uma jogada perigosa em andamento ou na fila (para desacelerar o relógio). */
  get busy(): boolean {
    return this.current !== undefined || this.queue.length > 0;
  }

  /** Confirma tudo de imediato, sem animação (pausa, instantâneo). */
  flush(): void {
    if (this.current) this.finishJob(this.current.job, true);
    this.current = undefined;
    for (const j of this.queue) this.finishJob(j, true);
    this.queue = [];
    this.ball.mode = 'loose';
  }

  private finishJob(job: Job, instant: boolean): void {
    if (!job.committed && job.ev) {
      job.committed = true;
      this.onCommit(job.ev);
    }
    if (instant) {
      // posiciona a bola de forma coerente sem animar
      const ev = job.ev;
      if (ev && (ev.type === 'advance' || ev.type === 'possession-change')) {
        this.possession = ev.team;
        this.zone = ev.zone === 'BOX' ? 'ATT' : ev.zone;
      }
    }
  }

  private buildJob(ev: MatchEvent, names: (id: string) => string): Job {
    const beats: Beat[] = [];
    let commitAfter = 0;
    let lines: string[] | undefined;
    const side = ev.team;
    const at = (z: Zone) => zoneX(side, z);
    const outcomeOf = (t: MatchEvent['type']): ShotOutcome | undefined =>
      t === 'goal' ? 'goal' : t === 'save' ? 'save' : t === 'hard-save' ? 'hard-save' : t === 'post' ? 'post' : t === 'miss' ? 'miss' : t === 'big-miss' ? 'big-miss' : undefined;

    switch (ev.type) {
      case 'advance':
      case 'possession-change': {
        const z = ev.zone === 'BOX' ? 'ATT' : ev.zone;
        const rec = this.pickReceiver(side, z);
        if (rec) beats.push({ kind: 'pass', to: rec, dur: ev.type === 'advance' ? 0.45 : 0.6, lofted: ev.type === 'possession-change' });
        break;
      }
      case 'goal':
      case 'save':
      case 'hard-save':
      case 'post':
      case 'miss':
      case 'big-miss': {
        const out = outcomeOf(ev.type) as ShotOutcome;
        const shooter = ev.playerId;
        const assist = ev.type === 'goal' ? ev.secondaryPlayerId : undefined;
        const dramatic = out === 'goal' || out === 'hard-save' || out === 'post' || out === 'big-miss';
        const lead = this.pickReceiver(side, 'ATT', shooter);
        const chain: string[] = [];
        if (assist && assist !== shooter) chain.push(assist);
        else if (lead && shooter) chain.push(lead);
        for (const id of chain) beats.push({ kind: 'pass', to: id, dur: 0.4 });
        if (shooter) {
          const crossing = ev.shotType === 'cruzamento';
          beats.push({ kind: 'pass', to: shooter, dur: crossing ? 0.65 : 0.4, lofted: crossing });
        }
        beats.push({ kind: 'hold', dur: dramatic ? 0.35 : 0.12 });
        beats.push({ kind: 'shot', side, outcome: out, dur: 0.55 * (out === 'goal' ? 1.8 : dramatic ? 1.3 : 1), holder: shooter });
        commitAfter = beats.length - 1;
        if (dramatic) beats.push({ kind: 'hold', dur: out === 'goal' ? 1.1 : 0.5 });
        if (ev.type === 'goal' || dramatic || chain.length) lines = this.buildUp(ev, chain, names);
        break;
      }
      case 'offside': {
        if (ev.playerId) beats.push({ kind: 'pass', to: ev.playerId, dur: 0.5, lofted: true });
        beats.push({ kind: 'hold', dur: 0.5 });
        commitAfter = beats.length - 1;
        break;
      }
      case 'penalty-shootout': {
        const x = goalX(side) + (side === 0 ? -11 : 11);
        beats.push({ kind: 'setball', x, y: FIELD_H / 2, holder: ev.playerId, dur: 0.3 });
        beats.push({ kind: 'shot', side, outcome: ev.scored ? 'goal' : 'save', dur: 0.7, holder: ev.playerId });
        commitAfter = beats.length - 1;
        beats.push({ kind: 'hold', dur: 0.5 });
        break;
      }
      case 'kickoff':
        beats.push({ kind: 'setball', x: FIELD_W / 2, y: FIELD_H / 2, dur: 0.4 });
        break;
      case 'foul':
      case 'yellow':
      case 'red':
        beats.push({ kind: 'hold', dur: ev.type === 'foul' ? 0.35 : 0.7 });
        break;
      case 'halftime':
        beats.push({ kind: 'hold', dur: 0.6 });
        break;
      default:
        break;
    }
    void at;
    return { ev, beats, commitAfter: Math.min(commitAfter, Math.max(0, beats.length - 1)), committed: false, lines };
  }

  /** Narração que cresce: relata a construção usando os jogadores que realmente participam da jogada. */
  private buildUp(ev: MatchEvent, chain: string[], names: (id: string) => string): string[] {
    const lane = this.rng.pick(['pela direita', 'pela esquerda', 'pelo meio']);
    const out: string[] = [];
    const first = chain[0] ? names(chain[0]) : undefined;
    if (first) out.push(`${first} avança ${lane}...`);
    if (ev.shotType === 'cruzamento') out.push('levanta a bola na área...');
    else if (ev.shotType === 'contra-ataque') out.push('sai em velocidade!');
    else if (chain.length) out.push('toca para o companheiro...');
    return out;
  }

  /** Escolhe quem recebe a bola perto do ponto da zona (sorteio de coreografia, não do motor). */
  private pickReceiver(side: 0 | 1, zone: Zone, exclude?: string): string | undefined {
    const x = zoneX(side, zone);
    const y = this.rng.range(FIELD_H * 0.2, FIELD_H * 0.8);
    const cands = [...this.agents.values()].filter((a) => a.side === side && a.id !== exclude && a.id !== this.ball.holder && (!a.keeper || zone === 'DEF'));
    if (!cands.length) return undefined;
    const w = cands.map((a) => Math.exp(-Math.hypot(a.x - x, a.y - y) / 14));
    return this.rng.weighted(cands, w).id;
  }

  // ---------- passo fixo ----------

  /** Avança `seconds` de coreografia em passos fixos de 1/60 s. */
  advance(seconds: number): void {
    this.acc += seconds;
    let guard = 0;
    while (this.acc >= STEP && guard++ < 600) {
      this.acc -= STEP;
      this.fixedStep();
    }
  }

  private fixedStep(): void {
    this.time += STEP;
    this.catchUp = this.queue.length > 5 ? 2.2 : this.queue.length > 3 ? 1.5 : 1;
    this.runBeats();
    this.updateAgents();
    this.updateBall();
    if (++this.frameTick % 2 === 0) this.record();
  }

  private runBeats(): void {
    if (!this.current) {
      const job = this.queue.shift();
      if (!job) return;
      if (job.lines?.length && job.ev) this.onLines(job.lines, job.ev);
      if (!job.beats.length) {
        this.finishJob(job, false);
        return;
      }
      this.current = { job, beat: 0, t: 0, from: { x: this.ball.x, y: this.ball.y }, fromZ: this.ball.z };
      this.beginBeat();
    }
    const c = this.current;
    if (!c) return;
    const beat = c.job.beats[c.beat] as Beat;
    c.t += STEP * this.catchUp;
    if (c.t >= beat.dur) {
      this.endBeat(beat);
      if (c.job.commitAfter === c.beat) this.finishJob(c.job, false);
      c.beat++;
      if (c.beat >= c.job.beats.length) {
        this.finishJob(c.job, false);
        this.current = undefined;
        return;
      }
      c.t = 0;
      c.from = { x: this.ball.x, y: this.ball.y };
      c.fromZ = this.ball.z;
      this.beginBeat();
    }
  }

  private beginBeat(): void {
    const c = this.current;
    if (!c) return;
    const beat = c.job.beats[c.beat] as Beat;
    if (beat.kind === 'setball') {
      this.ball.x = beat.x ?? FIELD_W / 2;
      this.ball.y = beat.y ?? FIELD_H / 2;
      this.ball.z = 0;
      c.from = { x: this.ball.x, y: this.ball.y };
      if (beat.holder) {
        const a = this.agents.get(beat.holder);
        if (a) {
          a.override = { x: this.ball.x - attackDir(a.side) * 0.8, y: this.ball.y, until: this.time + 1.2 };
          a.x = a.override.x;
          a.y = a.override.y;
        }
      }
      this.ball.holder = undefined;
      this.ball.mode = 'loose';
    } else if (beat.kind === 'pass') {
      this.ball.mode = 'pass';
      this.ball.holder = undefined;
      const a = beat.to ? this.agents.get(beat.to) : undefined;
      if (a) {
        this.possession = a.side;
        // o receptor corre ao encontro da bola
        a.override = { x: a.x, y: a.y, until: this.time + beat.dur + 0.4 };
      }
    } else if (beat.kind === 'shot') {
      this.ball.mode = 'shot';
      const sh = beat.holder ? this.agents.get(beat.holder) : undefined;
      if (sh) sh.override = { x: sh.x, y: sh.y, until: this.time + 1.4 };
      this.ball.holder = undefined;
    } else {
      this.ball.mode = this.ball.holder ? 'held' : this.ball.mode;
    }
  }

  private shotTarget(beat: Beat): { x: number; y: number } {
    const side = beat.side as 0 | 1;
    const gx = goalX(side);
    const cy = FIELD_H / 2;
    const r = this.shotRand;
    switch (beat.outcome) {
      case 'goal':
        return { x: gx + attackDir(side) * 0.9, y: cy + (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.8) };
      case 'post':
        return { x: gx, y: cy + (r() < 0.5 ? -1 : 1) * GOAL_HALF };
      case 'save':
      case 'hard-save':
        return { x: gx - attackDir(side) * 1.2, y: cy + (r() - 0.5) * 5 };
      case 'big-miss':
        return { x: gx + attackDir(side) * 3, y: cy + (r() < 0.5 ? -1 : 1) * (5 + r() * 3) };
      default:
        return { x: gx + attackDir(side) * 5, y: cy + (r() < 0.5 ? -1 : 1) * (6 + r() * 6) };
    }
  }

  private shotRand = () => this.rng.next();
  private shotDest?: { x: number; y: number };

  private updateBall(): void {
    const c = this.current;
    const b = this.ball;
    if (!c) {
      if (b.holder) {
        const h = this.agents.get(b.holder);
        if (h) {
          b.x = h.x + attackDir(h.side) * 0.7;
          b.y = h.y;
        }
      }
      b.z *= 0.8;
      return;
    }
    const beat = c.job.beats[c.beat] as Beat;
    const k = clamp(c.t / beat.dur, 0, 1);
    if (beat.kind === 'pass') {
      const a = beat.to ? this.agents.get(beat.to) : undefined;
      if (a) {
        const ex = a.x + attackDir(a.side) * 0.7;
        const ey = a.y;
        b.x = c.from.x + (ex - c.from.x) * k;
        b.y = c.from.y + (ey - c.from.y) * k;
        b.z = beat.lofted ? Math.sin(Math.PI * k) * 5 : Math.sin(Math.PI * k) * 0.6;
      }
    } else if (beat.kind === 'shot') {
      if (k === 0 || !this.shotDest) this.shotDest = this.shotTarget(beat);
      const d = this.shotDest;
      const kk = k * k * (3 - 2 * k) * 0 + k;
      b.x = c.from.x + (d.x - c.from.x) * kk;
      b.y = c.from.y + (d.y - c.from.y) * kk;
      b.z = Math.sin(Math.PI * kk) * (beat.outcome === 'miss' || beat.outcome === 'big-miss' ? 3.2 : 1.2);
    } else if (beat.kind === 'hold') {
      if (b.mode === 'shot' && this.shotDest && c.job.ev && (c.job.ev.type === 'goal')) {
        // bola dentro da rede: leve balanço
        b.x = this.shotDest.x + attackDir(c.job.ev.team) * 0.25 * Math.sin(c.t * 14) * Math.exp(-c.t * 3);
      } else if (b.holder) {
        const h = this.agents.get(b.holder);
        if (h) {
          b.x = h.x + attackDir(h.side) * 0.7;
          b.y = h.y;
        }
      }
      b.z *= 0.85;
    }
  }

  private endBeat(beat: Beat): void {
    const b = this.ball;
    if (beat.kind === 'pass' && beat.to) {
      b.holder = beat.to;
      b.mode = 'held';
      b.z = 0;
      const a = this.agents.get(beat.to);
      if (a) this.possession = a.side;
    } else if (beat.kind === 'shot') {
      const side = beat.side as 0 | 1;
      const ev = this.current?.job.ev;
      if (beat.outcome === 'goal') {
        this.onFx({ kind: 'net', side });
        this.onFx({ kind: 'goal', side, x: b.x, y: b.y });
        b.mode = 'loose';
      } else if (beat.outcome === 'post') {
        this.onFx({ kind: 'post', side });
        this.releaseTo(side === 0 ? 1 : 0, b.x - attackDir(side) * 6);
      } else if (beat.outcome === 'save' || beat.outcome === 'hard-save') {
        this.onFx({ kind: 'save', side, dive: beat.outcome === 'hard-save' });
        const gk = [...this.agents.values()].find((a) => a.keeper && a.side !== side);
        if (gk) {
          b.holder = gk.id;
          b.mode = 'held';
        } else b.mode = 'loose';
      } else {
        b.mode = 'loose';
        if (ev) this.releaseTo(side === 0 ? 1 : 0, b.x - attackDir(side) * 14);
      }
      this.shotDest = undefined;
    }
  }

  /** A bola sobra para o defensor mais próximo do ponto. */
  private releaseTo(side: 0 | 1, x: number): void {
    const cands = [...this.agents.values()].filter((a) => a.side === side && !a.keeper);
    let best: Agent | undefined;
    let bd = Infinity;
    for (const a of cands) {
      const d = Math.hypot(a.x - x, a.y - this.ball.y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (best) {
      this.ball.holder = best.id;
      this.ball.mode = 'held';
    } else this.ball.mode = 'loose';
  }

  // ---------- agentes ----------

  private updateAgents(): void {
    const list = [...this.agents.values()];
    const bx = this.ball.x;
    const by = this.ball.y;
    for (const a of list) {
      // referência da bola vista do ataque do próprio time, suavizada pelo atraso individual
      const ref = a.side === 0 ? bx / FIELD_W : 1 - bx / FIELD_W;
      a.focus += (ref - a.focus) * (1 - Math.exp(-STEP / a.lag));
      const line = a.slot === 'GK' ? 0 : a.slot === 'CB' || a.slot === 'LB' || a.slot === 'RB' || a.slot === 'WB' ? (this.tactics[a.side] - 0.5) * 0.14 : 0;
      const shift = a.keeper ? (a.focus - 0.5) * 0.04 : (a.focus - 0.5) * 0.36 + line;
      const dir = attackDir(a.side);
      const wob = Math.sin(this.time * 0.8 + a.phase) * 1.1;
      let tx = a.bx + dir * shift * FIELD_W + wob * dir;
      let ty = a.by + (by - FIELD_H / 2) * (a.keeper ? 0.1 : 0.12) + Math.cos(this.time * 0.6 + a.phase * 1.7) * 1.4;
      if (this.ball.holder === a.id && this.current) {
        tx = a.x + dir * 5;
        ty = a.y;
      }
      if (a.override && a.override.until > this.time) {
        tx = a.override.x;
        ty = a.override.y;
      }
      a.tx = clamp(tx, 1, FIELD_W - 1);
      a.ty = clamp(ty, 1, FIELD_H - 1);
    }
    // receptores correm em direção à bola
    const c = this.current;
    if (c) {
      const beat = c.job.beats[c.beat] as Beat;
      if (beat.kind === 'pass' && beat.to) {
        const a = this.agents.get(beat.to);
        if (a) {
          const k = clamp(c.t / beat.dur, 0, 1);
          a.tx = clamp(a.x + (this.ball.x - a.x) * (0.4 + 0.5 * k) , 1, FIELD_W - 1);
          a.ty = clamp(a.y + (this.ball.y - a.y) * (0.4 + 0.5 * k), 1, FIELD_H - 1);
        }
      }
      if (beat.kind === 'shot' || beat.kind === 'hold') {
        const ev = c.job.ev;
        if (ev && (ev.type === 'goal' || ev.type === 'save' || ev.type === 'hard-save' || ev.type === 'post' || ev.type === 'miss' || ev.type === 'big-miss')) {
          const gk = list.find((g) => g.keeper && g.side !== ev.team);
          if (gk) {
            gk.tx = clamp(goalX(ev.team) - attackDir(ev.team) * 1.5, 1, FIELD_W - 1);
            gk.ty = clamp(this.ball.y, FIELD_H / 2 - 4, FIELD_H / 2 + 4);
          }
        }
      }
    }
    // física: aceleração e velocidade limitadas
    for (const a of list) {
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(a.vmax, d * 2.2);
      const dvx = d > 0.01 ? (dx / d) * sp : 0;
      const dvy = d > 0.01 ? (dy / d) * sp : 0;
      const ax = clamp(dvx - a.vx, -a.accel * STEP, a.accel * STEP);
      const ay = clamp(dvy - a.vy, -a.accel * STEP, a.accel * STEP);
      a.vx += ax;
      a.vy += ay;
      const v = Math.hypot(a.vx, a.vy);
      if (v > a.vmax) {
        a.vx *= a.vmax / v;
        a.vy *= a.vmax / v;
      }
      a.x = clamp(a.x + a.vx * STEP, 0.5, FIELD_W - 0.5);
      a.y = clamp(a.y + a.vy * STEP, 0.5, FIELD_H - 0.5);
    }
    // separação mínima entre jogadores
    for (let i = 0; i < list.length; i++) {
      const p = list[i] as Agent;
      for (let j = i + 1; j < list.length; j++) {
        const q = list[j] as Agent;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 2.2) {
          const push = (2.2 - (d || 0.001)) / 2;
          const ux = d > 0.001 ? dx / d : 1;
          const uy = d > 0.001 ? dy / d : 0;
          p.x -= ux * push;
          p.y -= uy * push;
          q.x += ux * push;
          q.y += uy * push;
        }
      }
    }
  }

  // ---------- gravação para replay ----------

  private ids: string[] = [];

  private record(): void {
    let ids = [...this.agents.keys()].sort();
    if (ids.length === this.ids.length && ids.every((v, i) => v === this.ids[i])) ids = this.ids;
    this.ids = ids;
    const p: number[] = [];
    for (const id of ids) {
      const a = this.agents.get(id) as Agent;
      p.push(a.x, a.y);
    }
    this.frames.push({ t: this.time, ids, p, b: [this.ball.x, this.ball.y, this.ball.z] });
    if (this.frames.length > 600) this.frames.shift();
  }

  /** Últimos `seconds` de coreografia (para o replay do gol). */
  recent(seconds: number): Frame[] {
    const from = this.time - seconds;
    return this.frames.filter((f) => f.t >= from);
  }
}
