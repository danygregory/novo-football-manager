import { DEFAULT_PARAMS, type Params } from './params';
import { FORMATION_SLOTS } from './formations';
import { assignSlots, fit } from './lineup';
import {
  narrateAdvance,
  narrateFoul,
  narrateGoal,
  narrateBigMiss,
  narrateHardSave,
  narrateMiss,
  narrateOffside,
  narratePost,
  narrateRed,
  narrateSave,
  narrateShootoutKick,
  narrateSub,
  narrateTurnover,
  narrateYellow,
} from './narration';
import { overall } from './player';
import { Rng } from './prng';
import type {
  Attributes,
  EventType,
  Lineup,
  MatchEvent,
  MatchReport,
  Player,
  ShotType,
  Slot,
  Tactics,
  TeamMatchStats,
  Zone,
} from './types';

export interface TeamSetup {
  nationId: string;
  name: string;
  /** Os convocados (titulares + banco). */
  squad: Player[];
  lineup: Lineup;
  /** IA ajusta tática e faz substituições sozinha. */
  ai: boolean;
  /** Gols/jogo típicos da era (World.decades[].goalsPerMatchCompetitive); o jogo usa a média dos dois times. */
  goalRate?: number;
}

export interface MatchOptions {
  seed: number;
  /** Mata-mata: empate no tempo normal vai para prorrogação e pênaltis. */
  knockout?: boolean;
  /** 'summary' não gera eventos de fluxo (calibração rápida); o resultado é idêntico. */
  detail?: 'full' | 'summary';
  params?: Partial<Params>;
}

export const MAX_SUBS = 5;

/** Comandos do usuário durante a partida. A IA usa os mesmos efeitos, mas não os registra (são determinísticos). */
export type MatchCommand =
  | { kind: 'sub'; side: 0 | 1; outId: string; inId: string }
  | { kind: 'tactics'; side: 0 | 1; tactics: Tactics };

/** Comando + relógio exato (minutos, ponto flutuante) em que foi aplicado. Seed + lista = mesma partida. */
export interface LoggedCommand {
  at: number;
  cmd: MatchCommand;
}

export interface LiveSide {
  onPitch: { id: string; slot: Slot; cond: number }[];
  bench: { id: string; cond: number }[];
  subsLeft: number;
  tactics: Tactics;
}

/** Foto do estado da partida para a interface (campo, banco, tática). */
export interface LiveState {
  clock: number;
  minute: number;
  score: [number, number];
  ball: { team: 0 | 1; zone: Zone };
  finished: boolean;
  extraTime: boolean;
  sides: [LiveSide, LiveSide];
}

type Side = 0 | 1;
type FieldZone = 'DEF' | 'MID' | 'ATT';
type Mode = 'build' | 'counter' | 'long';

interface PState {
  p: Player;
  slot: Slot;
  cond: number;
  onPitch: boolean;
  played: boolean;
  yellows: number;
  rating: number;
}

interface Sectors {
  def: number;
  mid: number;
  att: number;
  speed: number;
  gk: number;
}

interface SideState {
  setup: TeamSetup;
  tactics: Tactics;
  players: PState[];
  subs: number;
  stats: { shots: number; onTarget: number; xg: number; fouls: number; yellows: number; reds: number; offsides: number; possTime: number };
  sectors: Sectors;
  dirty: boolean;
  aiMode: 'base' | 'attack' | 'defend';
  baseTactics: Tactics;
}

/** Quanto cada slot pesa em cada setor. */
const SLOT_WEIGHTS: Record<Slot, [number, number, number]> = {
  GK: [0, 0, 0],
  CB: [1, 0, 0],
  LB: [0.8, 0.1, 0.1],
  RB: [0.8, 0.1, 0.1],
  WB: [0.5, 0.25, 0.25],
  DM: [0.45, 0.55, 0],
  CM: [0.2, 0.65, 0.15],
  AM: [0, 0.5, 0.5],
  LW: [0, 0.3, 0.7],
  RW: [0, 0.3, 0.7],
  ST: [0, 0, 1],
};

const REF_WEIGHTS = (() => {
  const sum: [number, number, number] = [0, 0, 0];
  for (const s of FORMATION_SLOTS['4-4-2']) for (let i = 0; i < 3; i++) sum[i] = (sum[i] as number) + (SLOT_WEIGHTS[s][i] as number);
  return sum;
})();

function sectorQuality(a: Attributes): [number, number, number] {
  return [
    0.6 * a.defesa + 0.2 * a.fisico + 0.1 * a.velocidade + 0.1 * a.passe,
    0.4 * a.passe + 0.25 * a.drible + 0.2 * a.defesa + 0.15 * a.fisico,
    0.4 * a.finalizacao + 0.25 * a.drible + 0.2 * a.velocidade + 0.15 * a.passe,
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (s: Side): Side => (s === 0 ? 1 : 0);
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const SHOOTER_SLOT_WEIGHT: Record<Slot, number> = { GK: 0, CB: 0.04, LB: 0.04, RB: 0.04, WB: 0.06, DM: 0.1, CM: 0.25, AM: 0.55, LW: 0.7, RW: 0.7, ST: 1 };
const SET_PIECE_SLOT_WEIGHT: Record<Slot, number> = { GK: 0, CB: 0.35, LB: 0.1, RB: 0.1, WB: 0.1, DM: 0.15, CM: 0.3, AM: 0.5, LW: 0.35, RW: 0.35, ST: 0.8 };
const ASSIST_SLOT_WEIGHT: Record<Slot, number> = { GK: 0, CB: 0.1, LB: 0.4, RB: 0.4, WB: 0.5, DM: 0.35, CM: 0.8, AM: 1, LW: 0.8, RW: 0.8, ST: 0.45 };
const FOUL_SLOT_WEIGHT: Record<Slot, number> = { GK: 0, CB: 1, LB: 0.8, RB: 0.8, WB: 0.8, DM: 1.2, CM: 0.9, AM: 0.4, LW: 0.35, RW: 0.35, ST: 0.3 };

export class MatchSimulator {
  readonly params: Params;
  private rng: Rng;
  private sides: [SideState, SideState];
  private biasDef: Record<FieldZone, number>;
  private clock = 0;
  private maxClock = 90;
  private ball: { team: Side; zone: FieldZone; mode: Mode } = { team: 0, zone: 'MID', mode: 'build' };
  private score: [number, number] = [0, 0];
  private shootout?: [number, number];
  private events: MatchEvent[] = [];
  private full: boolean;
  private knockout: boolean;
  private halftimeDone = false;
  private extraTimeStarted = false;
  private done = false;
  private lastAiMinute = 0;
  private starters: [string[], string[]];
  private seed: number;
  private log: LoggedCommand[] = [];
  /** Fator do ambiente de gols da era: divide-se entre mais posses e chances melhores. */
  private eraFactor = 1;

  constructor(setups: [TeamSetup, TeamSetup], opts: MatchOptions) {
    this.params = { ...DEFAULT_PARAMS, ...opts.params };
    this.seed = opts.seed >>> 0;
    this.rng = new Rng(this.seed);
    this.full = (opts.detail ?? 'full') === 'full';
    this.knockout = opts.knockout ?? false;
    const k = this.params.k;
    const adv = this.params.advance0;
    const b = (p: number) => Math.pow(p / (1 - p), 1 / k);
    const g0 = setups[0].goalRate ?? this.params.baseGoalRate;
    const g1 = setups[1].goalRate ?? this.params.baseGoalRate;
    this.eraFactor = Math.pow(clamp((g0 + g1) / 2 / this.params.baseGoalRate, 0.5, 2), this.params.eraExp);
    this.biasDef = { DEF: b(adv.DEF), MID: b(adv.MID), ATT: b(adv.ATT) };
    this.sides = [this.makeSide(setups[0]), this.makeSide(setups[1])];
    this.starters = [this.sides[0].setup.lineup.starters.slice(), this.sides[1].setup.lineup.starters.slice()];
    const first = this.rng.chance(0.5) ? 0 : 1;
    this.ball = { team: first, zone: 'MID', mode: 'build' };
    this.emit('kickoff', first, 'MID', { text: `Começa a partida! ${this.sides[first].setup.name} dá a saída.` });
  }

  // ---------- montagem ----------

  private makeSide(setup: TeamSetup): SideState {
    const byId = new Map(setup.squad.map((p) => [p.id, p]));
    const slots = FORMATION_SLOTS[setup.lineup.tactics.formation];
    const players: PState[] = [];
    setup.lineup.starters.forEach((id, i) => {
      const p = byId.get(id);
      if (!p) throw new Error(`Titular ${id} fora do elenco`);
      players.push({ p, slot: slots[i] as Slot, cond: p.condition, onPitch: true, played: true, yellows: 0, rating: 6 });
    });
    for (const id of setup.lineup.bench) {
      const p = byId.get(id);
      if (!p) throw new Error(`Reserva ${id} fora do elenco`);
      players.push({ p, slot: p.slot, cond: p.condition, onPitch: false, played: false, yellows: 0, rating: 6 });
    }
    const tactics = { ...setup.lineup.tactics };
    return {
      setup,
      tactics,
      baseTactics: { ...tactics },
      players,
      subs: 0,
      stats: { shots: 0, onTarget: 0, xg: 0, fouls: 0, yellows: 0, reds: 0, offsides: 0, possTime: 0 },
      sectors: { def: 0, mid: 0, att: 0, speed: 0, gk: 0 },
      dirty: true,
      aiMode: 'base',
    };
  }

  // ---------- consultas públicas ----------

  get minute(): number {
    return Math.min(Math.floor(this.clock) + 1, this.maxClock);
  }
  get finished(): boolean {
    return this.done;
  }
  get currentScore(): [number, number] {
    return [this.score[0], this.score[1]];
  }
  get ballState(): { team: Side; zone: Zone } {
    return { team: this.ball.team, zone: this.ball.zone };
  }
  /** Eventos gerados até agora (a lista só cresce). */
  get eventLog(): readonly MatchEvent[] {
    return this.events;
  }
  liveState(): LiveState {
    const side = (i: Side): LiveSide => {
      const s = this.sides[i];
      return {
        onPitch: s.players.filter((x) => x.onPitch).map((x) => ({ id: x.p.id, slot: x.slot, cond: Math.round(x.cond * 10) / 10 })),
        bench: s.players.filter((x) => !x.onPitch && !x.played).map((x) => ({ id: x.p.id, cond: Math.round(x.cond * 10) / 10 })),
        subsLeft: MAX_SUBS - s.subs,
        tactics: { ...s.tactics },
      };
    };
    return {
      clock: Math.round(this.clock * 1000) / 1000,
      minute: this.minute,
      score: [this.score[0], this.score[1]],
      ball: { team: this.ball.team, zone: this.ball.zone },
      finished: this.done,
      extraTime: this.extraTimeStarted,
      sides: [side(0), side(1)],
    };
  }
  onPitch(side: Side): Player[] {
    return this.sides[side].players.filter((x) => x.onPitch).map((x) => x.p);
  }
  benchPlayers(side: Side): Player[] {
    return this.sides[side].players.filter((x) => !x.onPitch && !x.played).map((x) => x.p);
  }
  condition(side: Side, id: string): number | undefined {
    return this.sides[side].players.find((x) => x.p.id === id)?.cond;
  }
  tacticsOf(side: Side): Tactics {
    return { ...this.sides[side].tactics };
  }
  subsLeft(side: Side): number {
    return MAX_SUBS - this.sides[side].subs;
  }

  // ---------- comandos ----------

  /** Relógio exato (sem arredondamento); é o `at` gravado no log de comandos. */
  get clockExact(): number {
    return this.clock;
  }
  /** Comandos aplicados até agora, na ordem. */
  get commands(): readonly LoggedCommand[] {
    return this.log;
  }

  /** Aplica um comando do usuário e o registra no log (só se teve efeito). */
  execute(cmd: MatchCommand): boolean {
    let ok = false;
    if (cmd.kind === 'sub') ok = this.doSubstitute(cmd.side, cmd.outId, cmd.inId);
    else {
      this.doSetTactics(cmd.side, cmd.tactics);
      ok = true;
    }
    if (ok) this.log.push({ at: this.clock, cmd });
    return ok;
  }

  substitute(side: Side, outId: string, inId: string): boolean {
    return this.execute({ kind: 'sub', side, outId, inId });
  }

  setTactics(side: Side, tactics: Tactics): void {
    this.execute({ kind: 'tactics', side, tactics });
  }

  private doSubstitute(side: Side, outId: string, inId: string): boolean {
    const s = this.sides[side];
    if (this.done || s.subs >= MAX_SUBS) return false;
    const out = s.players.find((x) => x.p.id === outId && x.onPitch);
    const inn = s.players.find((x) => x.p.id === inId && !x.onPitch && !x.played);
    if (!out || !inn) return false;
    out.onPitch = false;
    inn.onPitch = true;
    inn.played = true;
    inn.slot = out.slot;
    s.subs++;
    s.dirty = true;
    this.emit('sub', side, this.ball.zone, {
      playerId: outId,
      secondaryPlayerId: inId,
      text: narrateSub({ ...this.ctx(side), player: out.p.name, other: inn.p.name }),
    });
    return true;
  }

  private doSetTactics(side: Side, tactics: Tactics): void {
    const s = this.sides[side];
    const changedFormation = tactics.formation !== s.tactics.formation;
    s.tactics = { ...tactics };
    if (changedFormation) {
      const onField = s.players.filter((x) => x.onPitch);
      const ids = assignSlots(
        onField.map((x) => x.p),
        tactics.formation,
        (p) => overall(p),
      );
      const slots = FORMATION_SLOTS[tactics.formation];
      ids.forEach((id, i) => {
        const ps = onField.find((x) => x.p.id === id);
        if (ps) ps.slot = slots[i] as Slot;
      });
    }
    s.dirty = true;
    this.emit('tactic', side, this.ball.zone, {
      text: `${s.setup.name} muda a tática: ${tactics.formation}, pressão ${Math.round(tactics.pressing * 100)}%, linha ${Math.round(tactics.lineHeight * 100)}%, ritmo ${Math.round(tactics.tempo * 100)}%.`,
    });
  }

  // ---------- execução ----------

  /** Simula até o relógio chegar ao minuto indicado (ou ao fim do jogo). */
  playUntil(minute: number): void {
    while (!this.done && this.clock < minute) this.advance(minute);
  }

  playToEnd(): MatchReport {
    while (!this.done) this.advance(Infinity);
    return this.report();
  }

  private advance(limit: number): void {
    const clockBefore = this.clock;
    if (!this.halftimeDone && this.clock >= 45) {
      this.halftimeDone = true;
      this.emit('halftime', this.ball.team, 'MID', { text: `Fim do primeiro tempo: ${this.scoreText()}.` });
      this.ball = { team: other(this.ball.team), zone: 'MID', mode: 'build' };
    }
    if (this.clock >= this.maxClock) {
      if (this.knockout && this.score[0] === this.score[1] && !this.extraTimeStarted) {
        this.extraTimeStarted = true;
        this.maxClock = 120;
        this.emit('kickoff', this.ball.team, 'MID', { text: 'Empate no tempo normal: vamos à prorrogação.' });
        return;
      }
      this.finish();
      return;
    }
    // minuto novo: fadiga, IA, setores
    const whole = Math.floor(this.clock);
    if (whole > this.lastAiMinute || this.lastAiMinute === 0) {
      for (let m = this.lastAiMinute + 1; m <= whole; m++) this.minuteTick(m);
      this.lastAiMinute = Math.max(this.lastAiMinute, whole);
    }
    this.step();
    if (this.clock === clockBefore) this.clock += 0.01; // salvaguarda
    if (this.clock > limit && limit !== Infinity) return;
  }

  private minuteTick(minute: number): void {
    const f = this.params.fatigue;
    for (const s of this.sides) {
      for (const x of s.players) {
        if (!x.onPitch) continue;
        const gk = x.slot === 'GK' ? 0.25 : 1;
        const loss = (f.base + f.press * s.tactics.pressing + f.tempo * s.tactics.tempo + f.line * s.tactics.lineHeight) * (1.3 - x.p.attrs.fisico / 150) * gk;
        x.cond = Math.max(0, x.cond - loss);
      }
      s.dirty = true;
    }
    for (const side of [0, 1] as Side[]) if (this.sides[side].setup.ai) this.aiManage(side, minute);
  }

  private aiManage(side: Side, minute: number): void {
    const s = this.sides[side];
    const diff = this.score[side] - this.score[other(side)];
    if (minute >= 70 && diff < 0 && s.aiMode !== 'attack') {
      s.aiMode = 'attack';
      this.doSetTactics(side, { ...s.tactics, pressing: 0.75, lineHeight: 0.75, tempo: 0.8 });
    } else if (minute >= 80 && diff > 0 && s.aiMode !== 'defend') {
      s.aiMode = 'defend';
      this.doSetTactics(side, { ...s.tactics, pressing: 0.3, lineHeight: 0.2, tempo: 0.3 });
    }
    const subMinutes = [58, 66, 74, 82, 100, 108];
    if (subMinutes.includes(minute) && s.subs < MAX_SUBS && (s.subs < 3 || minute >= 74)) {
      const tired = s.players
        .filter((x) => x.onPitch && x.slot !== 'GK' && x.cond < 62)
        .sort((a, b) => a.cond - b.cond)[0];
      if (tired) {
        const repl = s.players
          .filter((x) => !x.onPitch && !x.played && x.p.position === tired.p.position)
          .sort((a, b) => overall(b.p) * (0.7 + 0.3 * b.cond / 100) - overall(a.p) * (0.7 + 0.3 * a.cond / 100))[0];
        if (repl) this.doSubstitute(side, tired.p.id, repl.p.id);
      }
    }
  }

  // ---------- setores ----------

  private sectorsOf(side: Side): Sectors {
    const s = this.sides[side];
    if (!s.dirty) return s.sectors;
    const sums = [0, 0, 0];
    const weights = [0, 0, 0];
    let speedSum = 0;
    let speedW = 0;
    let gk = 30;
    for (const x of s.players) {
      if (!x.onPitch) continue;
      const f = (1 - this.params.fatigueImpact) + this.params.fatigueImpact * (x.cond / 100);
      const fitV = fit(x.p, x.slot);
      if (x.slot === 'GK') {
        gk = x.p.attrs.goleiro * f * fitV;
        continue;
      }
      const q = sectorQuality(x.p.attrs);
      const w = SLOT_WEIGHTS[x.slot];
      for (let i = 0; i < 3; i++) {
        sums[i] = (sums[i] as number) + (w[i] as number) * (q[i] as number) * f * fitV;
        weights[i] = (weights[i] as number) + (w[i] as number);
      }
      speedSum += (w[2] as number) * x.p.attrs.velocidade * f;
      speedW += w[2] as number;
    }
    const sector = (i: number) => {
      const w = weights[i] as number;
      if (w <= 0) return 1;
      return ((sums[i] as number) / w) * Math.pow(w / (REF_WEIGHTS[i] as number), 0.5);
    };
    s.sectors = { def: sector(0), mid: sector(1), att: sector(2), speed: speedW > 0 ? speedSum / speedW : 50, gk };
    s.dirty = false;
    return s.sectors;
  }

  // ---------- passo de jogo ----------

  private p(a: number, b: number): number {
    const k = this.params.k;
    const x = Math.pow(a, k);
    return x / (x + Math.pow(b, k));
  }

  private step(): void {
    const aSide = this.ball.team;
    const dSide = other(aSide);
    const a = this.sides[aSide];
    const d = this.sides[dSide];
    const sa = this.sectorsOf(aSide);
    const sd = this.sectorsOf(dSide);
    const tempoAvg = (a.tactics.tempo + d.tactics.tempo) / 2;
    const dur = (this.params.stepMinutes / this.eraFactor / (0.8 + 0.4 * tempoAvg)) * (this.ball.mode === 'build' ? 1 : 0.6);
    this.clock += dur;
    a.stats.possTime += dur;

    const zone = this.ball.zone;
    const pressD = d.tactics.pressing;
    const lineD = d.tactics.lineHeight;
    const precision = 1 - 0.1 * (a.tactics.tempo - 0.5);

    // bola longa a partir da defesa
    if (zone === 'DEF' && this.ball.mode === 'build') {
      const pLong = this.params.longBallBase * (0.5 + 1.0 * a.tactics.tempo) * (0.6 + 0.9 * lineD);
      if (this.rng.chance(pLong)) {
        const A = sa.att * Math.pow(sa.speed / 65, 0.7);
        const B = sd.def * (1.1 - 0.4 * lineD);
        const pr = this.p(A * Math.pow(this.params.longBall0 / (1 - this.params.longBall0), 1 / this.params.k), B);
        if (this.rng.chance(pr)) {
          if (this.offside(aSide, lineD, 1.8)) return;
          this.ball = { team: aSide, zone: 'ATT', mode: 'long' };
          this.flow('advance', aSide, 'ATT', narrateAdvance({ ...this.ctx(aSide), zone: 'ATT' }));
        } else {
          this.turnover(aSide, 'DEF', false);
        }
        return;
      }
    }

    let A: number;
    let B: number;
    let next: Zone;
    if (zone === 'DEF') {
      A = (0.7 * sa.mid + 0.3 * sa.def) * precision;
      B = sd.mid * (1 + 0.25 * (pressD - 0.5));
      next = 'MID';
    } else if (zone === 'MID') {
      A = (0.6 * sa.mid + 0.4 * sa.att) * precision * (1 + this.params.tactics.attackLine * (a.tactics.lineHeight - 0.5));
      B = (0.5 * sd.mid + 0.5 * sd.def) * (1 + 0.2 * (pressD - 0.5)) * (1 + 0.1 * (lineD - 0.5));
      next = 'ATT';
    } else {
      next = 'BOX';
      if (this.ball.mode === 'build') {
        A = sa.att * precision * (1 + this.params.tactics.attackTempo * (a.tactics.tempo - 0.5));
        B = sd.def * (1 + this.params.tactics.defLineCompact * (0.5 - lineD));
      } else {
        A = sa.att * Math.pow(sa.speed / 65, 0.7);
        B = sd.def * (1.1 - 0.4 * lineD);
      }
    }
    const bias = this.biasDef[zone];
    const win = this.rng.chance(this.p(A * bias, B));

    if (win) {
      if (next === 'BOX') {
        if (this.offside(aSide, lineD, this.ball.mode === 'counter' ? 1.3 : 1)) return;
        const type: ShotType = this.ball.mode === 'build' ? (this.rng.chance(0.22) ? 'cruzamento' : 'trabalhada') : 'contra-ataque';
        const quality = clamp(Math.pow(A / B, this.params.qualityExp), 0.5, 2);
        this.shoot(aSide, type, quality);
      } else {
        this.ball = { team: aSide, zone: next, mode: 'build' };
        this.flow('advance', aSide, next, narrateAdvance({ ...this.ctx(aSide), zone: next }));
      }
      return;
    }

    // disputa perdida: falta ou perda de posse
    const pFoul = this.params.foulBase * (0.7 + 0.6 * pressD) * (0.8 + 0.4 * d.tactics.tempo);
    if (this.rng.chance(pFoul)) {
      this.foul(dSide, aSide, zone, next === 'BOX');
      return;
    }
    // perda na transição para `next`: o adversário recebe a bola na zona espelhada
    const lostAt: FieldZone = next === 'MID' ? 'MID' : 'ATT';
    this.turnover(aSide, lostAt, next === 'MID' || next === 'ATT');
  }

  /** Impedimento: a linha alta adversária prende mais atacantes, sobretudo em bola longa. Devolve true se anulou a jogada. */
  private offside(attacker: Side, defLine: number, modeMult: number): boolean {
    const p = this.params.offsideBase * (0.4 + 1.3 * defLine) * modeMult;
    if (!this.rng.chance(p)) return false;
    const A = this.sides[attacker];
    const who = this.pickPlayer(attacker, (x) => SHOOTER_SLOT_WEIGHT[x.slot] * Math.max(1, x.p.attrs.velocidade));
    A.stats.offsides++;
    this.addRating(who, -0.05);
    this.emit('offside', attacker, 'ATT', { playerId: who.p.id, text: narrateOffside({ ...this.ctx(attacker), player: who.p.name }) });
    this.ball = { team: other(attacker), zone: 'DEF', mode: 'build' };
    return true;
  }

  /** `from` = zona (do ponto de vista de quem perdeu) onde a bola foi perdida. */
  private turnover(loser: Side, from: FieldZone, allowCounter: boolean): void {
    const winner = other(loser);
    const mirrored: FieldZone = from === 'DEF' ? 'ATT' : from === 'ATT' ? 'DEF' : 'MID';
    const L = this.sides[loser];
    const W = this.sides[winner];
    let mode: Mode = 'build';
    let zone: FieldZone = mirrored;
    if (allowCounter && from !== 'DEF') {
      const pCounter =
        this.params.counterBase *
        (0.6 + 1.2 * L.tactics.lineHeight + 0.5 * L.tactics.pressing) *
        (0.6 + 0.8 * W.tactics.tempo) *
        (1 - this.params.tactics.pressRecover + 2 * this.params.tactics.pressRecover * W.tactics.pressing) *
        clamp(this.sectorsOf(winner).speed / 65, 0.7, 1.4) *
        (from === 'ATT' ? 0.5 : 1.0);
      if (this.rng.chance(pCounter)) {
        mode = 'counter';
        zone = 'ATT';
      }
    }
    this.ball = { team: winner, zone, mode };
    this.flow('possession-change', winner, zone, narrateTurnover({ ...this.ctx(winner), zone }));
  }

  private foul(fouler: Side, victim: Side, zone: FieldZone, inFinalDuel: boolean): void {
    const F = this.sides[fouler];
    F.stats.fouls++;
    const culprit = this.pickPlayer(fouler, (x) => FOUL_SLOT_WEIGHT[x.slot] * (110 - x.p.attrs.defesa * 0.5));
    const target = this.pickPlayer(victim, (x) => ASSIST_SLOT_WEIGHT[x.slot] + 0.2);
    this.addRating(culprit, -0.1);
    const evZone: Zone = inFinalDuel ? 'BOX' : zone;
    this.emit('foul', fouler, evZone, {
      playerId: culprit.p.id,
      secondaryPlayerId: target.p.id,
      text: narrateFoul({ ...this.ctx(fouler), player: culprit.p.name, other: target.p.name }),
    });
    // cartões
    if (this.rng.chance(this.params.redPerFoul)) {
      this.sendOff(fouler, culprit);
    } else if (this.rng.chance(this.params.yellowPerFoul * (0.8 + 0.4 * F.tactics.pressing))) {
      culprit.yellows++;
      F.stats.yellows++;
      this.addRating(culprit, -0.3);
      this.emit('yellow', fouler, evZone, { playerId: culprit.p.id, text: narrateYellow({ ...this.ctx(fouler), player: culprit.p.name }) });
      if (culprit.yellows >= 2) this.sendOff(fouler, culprit);
    }
    // consequência: posse mantida; falta perto da área vira chute; pênalti
    if (inFinalDuel && this.rng.chance(this.params.penaltyPerBoxFoul)) {
      this.shoot(victim, 'penalti', 1);
    } else if (inFinalDuel && this.rng.chance(this.params.freeKickShot)) {
      this.shoot(victim, 'bola-parada', 1);
    } else {
      this.ball = { team: victim, zone, mode: 'build' };
    }
  }

  private sendOff(side: Side, x: PState): void {
    const S = this.sides[side];
    x.onPitch = false;
    S.stats.reds++;
    S.dirty = true;
    this.addRating(x, -1.5);
    this.emit('red', side, this.ball.zone, { playerId: x.p.id, text: narrateRed({ ...this.ctx(side), player: x.p.name }) });
  }

  // ---------- finalização ----------

  private shoot(side: Side, type: ShotType, quality: number): void {
    const S = this.sides[side];
    const D = this.sides[other(side)];
    const isPen = type === 'penalti';
    const slotW = type === 'cruzamento' || type === 'bola-parada' ? SET_PIECE_SLOT_WEIGHT : SHOOTER_SLOT_WEIGHT;
    const shooter = this.pickPlayer(side, (x) => slotW[x.slot] * Math.pow(Math.max(1, x.p.attrs.finalizacao), 2) * (isPen ? 1 : 1));
    const assister = isPen || type === 'bola-parada' ? undefined : this.pickPlayer(side, (x) => (x === shooter ? 0 : ASSIST_SLOT_WEIGHT[x.slot] * Math.pow(Math.max(1, x.p.attrs.passe), 2)));
    const keeper = D.players.find((x) => x.onPitch && x.slot === 'GK');

    const xg = clamp(this.params.xg[type] * (isPen ? 1 : quality * this.eraFactor), 0.01, 0.95);
    const f = (x: PState) => (1 - this.params.fatigueImpact) + this.params.fatigueImpact * (x.cond / 100);
    const fin = shooter.p.attrs.finalizacao * f(shooter) * fit(shooter.p, shooter.slot);
    const gk = keeper ? keeper.p.attrs.goleiro * f(keeper) : 20;
    const c = this.params.conv;
    const pGoal = clamp(sigmoid(logit(xg) + c.slope * (fin - c.fin) - c.slope * (gk - c.gk)), 0.005, 0.97);
    const pOnTarget = Math.max(pGoal, clamp(0.28 + 1.0 * xg, 0.28, 0.97));

    S.stats.shots++;
    S.stats.xg += xg;
    const roll = this.rng.next();
    const names = { ...this.ctx(side), player: shooter.p.name, other: assister?.p.name, shotType: type, xg };

    if (roll < pGoal) {
      S.stats.onTarget++;
      this.score[side]++;
      this.addRating(shooter, 1.0);
      if (assister) this.addRating(assister, 0.6);
      if (keeper) this.addRating(keeper, -0.3);
      for (const x of D.players) if (x.onPitch && (x.slot === 'CB' || x.slot === 'LB' || x.slot === 'RB' || x.slot === 'WB')) this.addRating(x, -0.15);
      this.emit('goal', side, 'BOX', {
        playerId: shooter.p.id,
        secondaryPlayerId: assister?.p.id,
        shotType: type,
        xg,
        text: `${narrateGoal(names)} (${this.scoreText()})`,
      });
      this.ball = { team: other(side), zone: 'MID', mode: 'build' };
      return;
    }
    if (roll < pOnTarget) {
      S.stats.onTarget++;
      this.addRating(shooter, 0.05);
      const hard = xg >= this.params.hardSaveXg;
      if (keeper) this.addRating(keeper, hard ? 0.35 : 0.2);
      this.emit(hard ? 'hard-save' : 'save', side, 'BOX', {
        playerId: shooter.p.id,
        secondaryPlayerId: keeper?.p.id,
        shotType: type,
        xg,
        text: (hard ? narrateHardSave : narrateSave)({ ...names, other: keeper?.p.name ?? 'o goleiro' }),
      });
    } else if ((roll - pOnTarget) / (1 - pOnTarget) < this.params.postShare) {
      this.addRating(shooter, 0);
      this.emit('post', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, text: narratePost(names) });
    } else if (xg >= this.params.bigChanceXg) {
      this.addRating(shooter, -0.25);
      this.emit('big-miss', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, text: narrateBigMiss(names) });
    } else {
      this.addRating(shooter, -0.05);
      this.emit('miss', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, text: narrateMiss(names) });
    }
    if (type !== 'penalti' && type !== 'bola-parada' && this.rng.chance(this.params.cornerAfterSave * (roll < pOnTarget ? 1 : 0.8))) {
      this.shoot(side, 'bola-parada', 1);
      return;
    }
    // bola vai para o adversário na defesa
    this.ball = { team: other(side), zone: 'DEF', mode: 'build' };
  }

  // ---------- encerramento e pênaltis ----------

  private finish(): void {
    if (this.knockout && this.score[0] === this.score[1]) this.runShootout();
    this.done = true;
    this.emit('fulltime', this.ball.team, 'MID', {
      text: `Fim de jogo: ${this.scoreText()}${this.shootout ? ` (pênaltis ${this.shootout[0]}-${this.shootout[1]})` : ''}.`,
    });
  }

  private runShootout(): void {
    const takers = [0, 1].map((i) =>
      this.sides[i as Side].players
        .filter((x) => x.onPitch && x.slot !== 'GK')
        .sort((a, b) => b.p.attrs.finalizacao - a.p.attrs.finalizacao),
    );
    const keepers = [0, 1].map((i) => this.sides[i as Side].players.find((x) => x.onPitch && x.slot === 'GK'));
    const res: [number, number] = [0, 0];
    const taken: [number, number] = [0, 0];
    const kick = (side: Side): void => {
      const list = takers[side] as PState[];
      const taker = list[taken[side] % list.length] as PState;
      const keeper = keepers[other(side)];
      taken[side]++;
      const p = clamp(0.76 + 0.004 * (taker.p.attrs.finalizacao - 70) - 0.003 * ((keeper?.p.attrs.goleiro ?? 50) - 70), 0.4, 0.95);
      const scored = this.rng.chance(p);
      if (scored) res[side]++;
      this.emit('penalty-shootout', side, 'BOX', {
        playerId: taker.p.id,
        scored,
        text: narrateShootoutKick({ ...this.ctx(side), player: taker.p.name, scored }),
      });
    };
    for (let round = 0; round < 5; round++) {
      for (const side of [0, 1] as Side[]) {
        kick(side);
        const left0 = 5 - taken[0];
        const left1 = 5 - taken[1];
        if (res[0] > res[1] + left1 || res[1] > res[0] + left0) {
          this.shootout = res;
          return;
        }
      }
    }
    let guard = 0;
    while (res[0] === res[1] && guard++ < 20) {
      kick(0);
      kick(1);
    }
    if (res[0] === res[1]) res[this.rng.chance(0.5) ? 0 : 1]++;
    this.shootout = res;
  }

  // ---------- utilidades ----------

  private pickPlayer(side: Side, weight: (x: PState) => number): PState {
    const field = this.sides[side].players.filter((x) => x.onPitch);
    const weights = field.map((x) => Math.max(0, weight(x)));
    if (weights.every((w) => w <= 0)) return field[0] as PState;
    return this.rng.weighted(field, weights);
  }

  private addRating(x: PState, delta: number): void {
    x.rating += delta;
  }

  private scoreText(): string {
    return `${this.sides[0].setup.name} ${this.score[0]} x ${this.score[1]} ${this.sides[1].setup.name}`;
  }

  private ctx(side: Side) {
    return { minute: this.minute, team: this.sides[side].setup.name, opponent: this.sides[other(side)].setup.name };
  }

  private flow(type: EventType, team: Side, zone: Zone, text: string): void {
    if (this.full) this.events.push({ minute: this.minute, type, team, zone, t: this.t3(), text });
  }

  private emit(type: EventType, team: Side, zone: Zone, extra: Partial<MatchEvent> & { text: string }): void {
    if (!this.full && type !== 'goal') {
      // no modo resumo só os gols são guardados (para o relatório); cartões/substituições também não.
      if (type !== 'red' && type !== 'yellow') return;
    }
    this.events.push({ minute: this.minute, type, team, zone, t: this.t3(), ...extra });
  }

  private t3(): number {
    return Math.round(this.clock * 1000) / 1000;
  }

  // ---------- relatório ----------

  report(): MatchReport {
    const stats = [0, 1].map((i): TeamMatchStats => {
      const s = this.sides[i as Side];
      const total = this.sides[0].stats.possTime + this.sides[1].stats.possTime;
      return {
        possession: total > 0 ? Math.round((s.stats.possTime / total) * 1000) / 10 : 50,
        shots: s.stats.shots,
        shotsOnTarget: s.stats.onTarget,
        xg: Math.round(s.stats.xg * 100) / 100,
        fouls: s.stats.fouls,
        yellows: s.stats.yellows,
        reds: s.stats.reds,
        offsides: s.stats.offsides,
      };
    }) as [TeamMatchStats, TeamMatchStats];

    const ratings: Record<string, number> = {};
    const finalCondition: Record<string, number> = {};
    for (const side of [0, 1] as Side[]) {
      const s = this.sides[side];
      const mine = this.score[side];
      const theirs = this.score[other(side)];
      const resultBonus = mine > theirs ? 0.3 : mine < theirs ? -0.2 : 0;
      for (const x of s.players) {
        finalCondition[x.p.id] = Math.round(x.cond * 10) / 10;
        if (!x.played) continue;
        let r = x.rating + resultBonus;
        if (theirs === 0 && (x.slot === 'GK' || x.slot === 'CB' || x.slot === 'LB' || x.slot === 'RB' || x.slot === 'WB')) r += 0.4;
        ratings[x.p.id] = Math.round(clamp(r, 3, 10) * 10) / 10;
      }
    }

    return {
      seed: this.seed,
      teams: [this.sides[0].setup.nationId, this.sides[1].setup.nationId],
      score: [this.score[0], this.score[1]],
      shootout: this.shootout,
      events: this.events,
      stats,
      ratings,
      finalCondition,
      starters: this.starters,
      extraTime: this.extraTimeStarted,
      minutes: this.extraTimeStarted ? 120 : 90,
    };
  }
}

/**
 * Reproduz uma partida a partir da seed, das escalações e do log de comandos do usuário:
 * avança até o relógio exato de cada comando, aplica e continua. O resultado é idêntico ao original.
 */
export function replayMatch(setups: [TeamSetup, TeamSetup], opts: MatchOptions, commands: readonly LoggedCommand[]): MatchReport {
  const sim = new MatchSimulator(setups, opts);
  for (const c of commands) {
    sim.playUntil(c.at);
    sim.execute(c.cmd);
  }
  return sim.playToEnd();
}

/** Simula a partida inteira de uma vez. */
export function simulateMatch(setups: [TeamSetup, TeamSetup], opts: MatchOptions): MatchReport {
  return new MatchSimulator(setups, opts).playToEnd();
}
