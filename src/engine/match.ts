import { clamp } from './util';
import { DEFAULT_PARAMS, type Params } from './params';
import { FORMATION_SLOTS } from './formations';
import { assignSlots, fit } from './lineup';
import {
  narrateAdvance,
  narrateFoul,
  narrateGoal,
  narrateBigMiss,
  narrateHardSave,
  narrateInjury,
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
  Dive,
  PenaltyInfo,
  PenaltyZone,
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
export type Shout = 'press' | 'drop' | 'long' | 'short';
export type TalkTone = 'motivate' | 'demand' | 'calm';

/** Duração e recarga (minutos de jogo) dos gritos táticos. */
export const SHOUT_MINUTES = 10;

export type MatchCommand =
  | { kind: 'sub'; side: 0 | 1; outId: string; inId: string }
  | { kind: 'tactics'; side: 0 | 1; tactics: Tactics }
  | { kind: 'shout'; side: 0 | 1; shout: Shout }
  | { kind: 'talk'; side: 0 | 1; tone: TalkTone }
  /** Resposta a um momento de decisão pendente (ver `Decision`). */
  | { kind: 'decide'; side: 0 | 1; id: number; choice: string; order?: string[] };

/**
 * Momentos de decisão: o motor para e espera o usuário.
 * - injury: jogador lesionado. choice = 'keep' ou id do reserva que entra.
 * - desperate: perdendo após os 75'. choice = 'allin' | 'hold'.
 * - penalty: pênalti a favor. choice = id do batedor.
 * - shootout: ordem dos batedores da disputa. order = ids (os 5 primeiros batem primeiro).
 * - aim / dive: canto da cobrança do usuário (PenaltyZone) ou lado do goleiro do usuário (Dive); 'auto' deixa o motor sortear.
 */
export type Decision =
  | { id: number; kind: 'injury'; side: 0 | 1; playerId: string }
  | { id: number; kind: 'desperate'; side: 0 | 1 }
  | { id: number; kind: 'penalty'; side: 0 | 1 }
  | { id: number; kind: 'shootout'; side: 0 | 1 }
  /** Batedor do usuário: canto da cobrança (zona) ou 'auto'. */
  | { id: number; kind: 'aim'; side: 0 | 1; takerId: string; shootout: boolean }
  /** Goleiro do usuário: lado do mergulho ou 'auto', quando o adversário cobra. */
  | { id: number; kind: 'dive'; side: 0 | 1; takerId: string; shootout: boolean };

/** No máximo 3 pausas de decisão por partida para cada time do usuário (a disputa de pênaltis não conta). */
export const MAX_DECISIONS = 3;

/** Modificadores de cada grito sobre a tática-base (somados e limitados a 0..1). */
const SHOUT_FX: Record<Shout, { pressing: number; lineHeight: number; tempo: number; longMult: number; prec: number }> = {
  press: { pressing: 0.4, lineHeight: 0.1, tempo: 0.1, longMult: 1, prec: 0 },
  drop: { pressing: -0.2, lineHeight: -0.35, tempo: -0.1, longMult: 1, prec: 0 },
  long: { pressing: 0, lineHeight: 0.05, tempo: 0.15, longMult: 2.2, prec: -0.03 },
  short: { pressing: 0, lineHeight: 0, tempo: -0.2, longMult: 0.3, prec: 0.06 },
};

/** Comando + relógio exato (minutos, ponto flutuante) em que foi aplicado. Seed + lista = mesma partida. */
export interface LoggedCommand {
  at: number;
  cmd: MatchCommand;
}

export interface LiveSide {
  /** Grito ativo (até o minuto `until`) e minuto em que a recarga acaba. */
  shout?: { kind: Shout; until: number };
  cooldownUntil: number;
  /** Já houve conversa de vestiário. */
  talked: boolean;
  /** Moral atual (multiplica a força dos setores). */
  morale: number;
  onPitch: { id: string; slot: Slot; cond: number; injured?: boolean }[];
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
  /** Decisão pendente (o motor está parado até a resposta). */
  decision?: Decision;
  decisionsLeft: [number, number];
  stats: [TeamMatchStats, TeamMatchStats];
  /** Nota atual (6 + lances) dos que já jogaram. */
  ratings: Record<string, number>;
  /** Pressão dos últimos 10 minutos: fatia do time 0 (0..1). */
  momentum: number;
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
  injured: boolean;
  /** Cache: qualidade por setor (atributos não mudam) e encaixe na posição atual. */
  q?: [number, number, number];
  fitSlot?: Slot;
  fitV?: number;
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
  shout?: { kind: Shout; until: number };
  cooldownUntil: number;
  morale: number;
  talked: boolean;
  calm: boolean;
  /** Pausas de decisão já usadas e se a de 'tudo ou nada' já foi oferecida. */
  decisions: number;
  desperateOffered: boolean;
  /** Multiplicadores de ataque/defesa de 'tudo ou nada' e 'segurar'. */
  attMult: number;
  defMult: number;
  shootoutOrder?: string[];
  /** Tática efetiva sem grito (cache; zera quando a tática muda). */
  fxBase?: Fx;
}

interface Fx {
  pressing: number;
  lineHeight: number;
  tempo: number;
  longMult: number;
  prec: number;
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

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Traços de craque que o motor reconhece: quem finaliza e quem cria ganham mais protagonismo nos lances. */
const SHOOTER_TRAITS = new Set(['artilheiro de área', 'centroavante completo', 'driblador decisivo', 'camisa 10 genial', 'ponta-foguete']);
const ASSIST_TRAITS = new Set(['armador cerebral', 'camisa 10 genial', 'lateral incansável']);

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
  /** Janela de pressão (últimos 10 min) para o painel ao vivo. */
  private momentumLog: { t: number; side: Side; w: number }[] = [];
  private stopAtBreak = false;
  private pending?: Decision;
  /** Pênalti em andamento no jogo (escolhas já feitas). */
  private pen?: { side: Side; takerId: string; aim?: PenaltyZone | 'auto'; dive?: Dive | 'auto' };
  /** Disputa de pênaltis em andamento (passo a passo, esperando as escolhas do usuário). */
  private so?: { takers: PState[][]; keepers: (PState | undefined)[]; res: [number, number]; taken: [number, number]; k: number; aim?: PenaltyZone | 'auto'; dive?: Dive | 'auto'; over: boolean };
  private decisionSeq = 1;
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
      players.push({ p, slot: slots[i] as Slot, cond: p.condition, onPitch: true, played: true, yellows: 0, rating: 6, injured: false });
    });
    for (const id of setup.lineup.bench) {
      const p = byId.get(id);
      if (!p) throw new Error(`Reserva ${id} fora do elenco`);
      players.push({ p, slot: p.slot, cond: p.condition, onPitch: false, played: false, yellows: 0, rating: 6, injured: false });
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
      cooldownUntil: 0,
      morale: 0,
      talked: false,
      calm: false,
      decisions: 0,
      desperateOffered: false,
      attMult: 1,
      defMult: 1,
    };
  }

  // ---------- consultas públicas ----------

  get minute(): number {
    return Math.min(Math.floor(this.clock) + 1, this.maxClock);
  }
  get finished(): boolean {
    return this.done;
  }
  get pendingDecision(): Decision | undefined {
    return this.pending;
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
        onPitch: s.players.filter((x) => x.onPitch).map((x) => ({ id: x.p.id, slot: x.slot, cond: Math.round(x.cond * 10) / 10, injured: x.injured || undefined })),
        bench: s.players.filter((x) => !x.onPitch && !x.played).map((x) => ({ id: x.p.id, cond: Math.round(x.cond * 10) / 10 })),
        subsLeft: MAX_SUBS - s.subs,
        tactics: { ...s.tactics },
        shout: s.shout && s.shout.until > this.clock ? { ...s.shout } : undefined,
        cooldownUntil: s.cooldownUntil,
        talked: s.talked,
        morale: s.morale,
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
      decision: this.pending ? { ...this.pending } : undefined,
      decisionsLeft: [MAX_DECISIONS - this.sides[0].decisions, MAX_DECISIONS - this.sides[1].decisions],
      stats: this.statsOf(),
      ratings: this.ratingsNow(false),
      momentum: this.momentum(),
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
    if (this.pending && cmd.kind !== 'decide') return false;
    let ok = false;
    if (cmd.kind === 'sub') ok = this.doSubstitute(cmd.side, cmd.outId, cmd.inId);
    else if (cmd.kind === 'tactics') {
      this.doSetTactics(cmd.side, cmd.tactics);
      ok = true;
    } else if (cmd.kind === 'shout') ok = this.doShout(cmd.side, cmd.shout);
    else if (cmd.kind === 'talk') ok = this.doTalk(cmd.side, cmd.tone);
    else ok = this.doDecide(cmd);
    if (ok) this.log.push({ at: this.clock, cmd });
    return ok;
  }

  substitute(side: Side, outId: string, inId: string): boolean {
    return this.execute({ kind: 'sub', side, outId, inId });
  }

  setTactics(side: Side, tactics: Tactics): void {
    this.execute({ kind: 'tactics', side, tactics });
  }

  /** Tática efetiva: a base mais o grito ativo. */
  private fx(side: Side): Fx {
    const s = this.sides[side];
    const active = s.shout !== undefined && s.shout.until > this.clock;
    if (!active && s.fxBase) return s.fxBase;
    const t = s.tactics;
    const f = active ? SHOUT_FX[(s.shout as { kind: Shout }).kind] : undefined;
    const c = (v: number) => Math.max(0, Math.min(1, v));
    const out: Fx = {
      pressing: c(t.pressing + (f?.pressing ?? 0)),
      lineHeight: c(t.lineHeight + (f?.lineHeight ?? 0)),
      tempo: c(t.tempo + (f?.tempo ?? 0)),
      longMult: f?.longMult ?? 1,
      prec: f?.prec ?? 0,
    };
    if (!active) s.fxBase = out;
    return out;
  }

  /** Grito à beira do campo: vale por 10 minutos e depois exige 10 de recarga. */
  private doShout(side: Side, shout: Shout): boolean {
    const s = this.sides[side];
    if (this.done || this.clock < s.cooldownUntil || (s.shout && s.shout.until > this.clock)) return false;
    s.shout = { kind: shout, until: this.clock + SHOUT_MINUTES };
    s.cooldownUntil = this.clock + 2 * SHOUT_MINUTES;
    const label = { press: 'Pressionar!', drop: 'Recuar!', long: 'Bola longa!', short: 'Toque curto!' }[shout];
    this.emit('tactic', side, this.ball.zone, { text: `Grito do técnico (${s.setup.name}): ${label}` });
    return true;
  }

  /** Conversa de vestiário no intervalo (uma vez por time). O efeito tem risco e usa o sorteio da partida. */
  private doTalk(side: Side, tone: TalkTone): boolean {
    const s = this.sides[side];
    if (this.done || s.talked || !this.halftimeDone || this.clock > 52) return false;
    s.talked = true;
    const mine = this.score[side];
    const theirs = this.score[other(side)];
    let text: string;
    if (tone === 'motivate') {
      const good = this.rng.chance(0.75);
      s.morale += good ? 0.03 : -0.015;
      text = good ? 'o time volta inspirado' : 'o discurso soa vazio e o time volta apático';
    } else if (tone === 'demand') {
      const pGood = mine < theirs ? 0.7 : mine === theirs ? 0.5 : 0.35;
      const good = this.rng.chance(pGood);
      s.morale += good ? 0.05 : -0.04;
      text = good ? 'o time sente a cobrança e volta com sangue nos olhos' : 'a cobrança pesa e o time volta tenso';
    } else {
      const good = this.rng.chance(0.9);
      s.morale += good ? 0.01 : 0;
      s.calm = true;
      text = 'o time volta concentrado e disciplinado';
    }
    this.emit('tactic', side, this.ball.zone, { text: `Vestiário (${s.setup.name}): ${text}.` });
    return true;
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
    s.fxBase = undefined;
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
    while (!this.done && this.clock < minute && !this.pending) {
      this.advance(minute);
      if (this.stopAtBreak) {
        // o intervalo é um ponto de parada: o usuário decide antes do 2º tempo
        this.stopAtBreak = false;
        break;
      }
    }
  }

  /** Como `playUntil`, mas atravessa o intervalo sem parar (testes e simulações sem interface). */
  playThrough(minute: number): void {
    while (!this.done && this.clock < minute) {
      if (this.pending) this.execute(this.autoDecision(this.pending));
      else this.playUntil(minute);
    }
  }

  playToEnd(): MatchReport {
    while (!this.done) {
      // decisões pendentes são resolvidas automaticamente (e registradas no log, para o replay)
      if (this.pending) {
        this.execute(this.autoDecision(this.pending));
        continue;
      }
      this.advance(Infinity);
      this.stopAtBreak = false;
    }
    return this.report();
  }

  /** O jogo parou no intervalo (aguardando a volta do 2º tempo). */
  private doHalftime(): void {
    this.halftimeDone = true;
    this.emit('halftime', this.ball.team, 'MID', { text: `Fim do primeiro tempo: ${this.scoreText()}.` });
    this.ball = { team: other(this.ball.team), zone: 'MID', mode: 'build' };
    for (const side of [0, 1] as Side[]) {
      if (!this.sides[side].setup.ai) continue;
      const diff = this.score[side] - this.score[other(side)];
      this.doTalk(side, diff < 0 ? 'demand' : diff > 0 ? 'calm' : 'motivate');
    }
    this.stopAtBreak = true;
  }

  private advance(limit: number): void {
    if (this.pending) return;
    const clockBefore = this.clock;
    if (this.clock >= this.maxClock && !this.pending) {
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
    if (this.pending) return; // uma decisão abriu neste minuto: o jogo espera
    this.step();
    if (this.clock === clockBefore) this.clock += 0.01; // salvaguarda
    if (!this.halftimeDone && this.clock >= 45) this.doHalftime();
    if (this.clock > limit && limit !== Infinity) return;
  }

  private minuteTick(minute: number): void {
    const f = this.params.fatigue;
    for (const side of [0, 1] as Side[]) {
      const s = this.sides[side];
      // a tática efetiva é a mesma para o time inteiro: calcula uma vez por minuto, não uma vez por jogador
      const e = this.fx(side);
      const base = f.base + f.press * e.pressing + f.tempo * e.tempo + f.line * e.lineHeight;
      for (const x of s.players) {
        if (!x.onPitch) continue;
        const gk = x.slot === 'GK' ? 0.25 : 1;
        x.cond = Math.max(0, x.cond - base * (1.3 - x.p.attrs.fisico / 150) * gk);
      }
      s.dirty = true;
    }
    for (const side of [0, 1] as Side[]) {
      this.rollInjury(side);
      if (this.sides[side].setup.ai) this.aiManage(side, minute);
      else this.offerDesperate(side, minute);
    }
  }

  // ---------- momentos de decisão ----------

  /** Abre (ou resolve sozinho, se o usuário já usou as 3 pausas) uma decisão. Devolve true se o jogo ficou parado. */
  private open(
    decision:
      | { kind: 'injury'; side: Side; playerId: string }
      | { kind: 'desperate' | 'penalty' | 'shootout'; side: Side }
      | { kind: 'aim' | 'dive'; side: Side; takerId: string; shootout: boolean },
    counts = true,
  ): boolean {
    const s = this.sides[decision.side];
    if (s.setup.ai || (counts && s.decisions >= MAX_DECISIONS)) return false;
    if (counts) s.decisions++;
    this.pending = { ...decision, id: this.decisionSeq++ } as Decision;
    return true;
  }

  private rollInjury(side: Side): void {
    const s = this.sides[side];
    for (const x of s.players) {
      if (!x.onPitch || x.injured) continue;
      // mais provável quando cansado; goleiros raramente
      const p = this.params.injuryPerMinute * (x.slot === 'GK' ? 0.3 : 1) * (1.6 - x.cond / 100);
      if (!this.rng.chance(p)) continue;
      this.emit('injury', side, this.ball.zone, { playerId: x.p.id, text: narrateInjury({ ...this.ctx(side), player: x.p.name }) });
      if (this.pending) continue;
      if (this.open({ kind: 'injury', side, playerId: x.p.id })) return;
      this.applyInjury(side, x, undefined);
    }
  }

  /** Sem decisão do usuário (IA ou limite de pausas): troca se puder; senão o jogador segue lesionado. */
  private applyInjury(side: Side, x: PState, inId: string | undefined): void {
    const s = this.sides[side];
    if (inId === 'keep') {
      x.injured = true;
      s.dirty = true;
      return;
    }
    const repl =
      (inId ? s.players.find((y) => y.p.id === inId) : undefined) ??
      s.players
        .filter((y) => !y.onPitch && !y.played && y.p.position === x.p.position)
        .sort((a, b) => overall(b.p) * (0.7 + 0.3 * b.cond / 100) - overall(a.p) * (0.7 + 0.3 * a.cond / 100))[0];
    if (!repl || !this.doSubstitute(side, x.p.id, repl.p.id)) {
      x.injured = true;
      s.dirty = true;
    }
  }

  /** Perdendo após os 75': oferece "tudo ou nada" ou "segurar" uma única vez. */
  private offerDesperate(side: Side, minute: number): void {
    const s = this.sides[side];
    if (this.pending || s.desperateOffered || minute < 75 || this.clock >= 90 || this.score[side] >= this.score[other(side)]) return;
    s.desperateOffered = true;
    this.open({ kind: 'desperate', side });
  }

  /** Pênalti a favor de um time do usuário abre a escolha do batedor; para a IA, sorteia pelo padrão. */
  private awardPenalty(side: Side): void {
    this.ball = { team: side, zone: 'ATT', mode: 'build' };
    if (this.open({ kind: 'penalty', side })) return;
    const taker = this.pickPlayer(side, (x) => SHOOTER_SLOT_WEIGHT[x.slot] * Math.pow(Math.max(1, x.p.attrs.finalizacao), 2));
    this.beginPenalty(side, taker.p.id);
  }

  /** Definido o batedor, abre (se for do usuário) a escolha do canto e do lado do goleiro; depois cobra. */
  private beginPenalty(side: Side, takerId: string): void {
    this.pen = { side, takerId };
    this.advancePenalty();
  }

  private advancePenalty(): void {
    const p = this.pen;
    if (!p) return;
    const defender = other(p.side);
    if (!this.sides[p.side].setup.ai && p.aim === undefined) {
      this.open({ kind: 'aim', side: p.side, takerId: p.takerId, shootout: false }, false);
      return;
    }
    if (!this.sides[defender].setup.ai && p.dive === undefined) {
      this.open({ kind: 'dive', side: defender, takerId: p.takerId, shootout: false }, false);
      return;
    }
    this.shoot(p.side, 'penalti', 1, p.takerId);
    this.pen = undefined;
  }

  /**
   * Cobrança de pênalti: o canto (escolhido ou sorteado) encontra o mergulho do goleiro (escolhido ou sorteado).
   * Erro e trave dependem do canto e da frieza do batedor; a defesa só acontece se o goleiro for para o lado certo.
   */
  private penaltyKick(taker: PState, keeper: PState | undefined, aim: PenaltyZone | 'auto', dive: Dive | 'auto'): PenaltyInfo {
    const pr = this.params.penalty;
    const f = (x: PState) => (1 - this.params.fatigueImpact) + this.params.fatigueImpact * (x.cond / 100);
    // frieza: finalização com um pouco de passe (visão/controle), reduzida pelo cansaço
    const q = clamp(((0.7 * taker.p.attrs.finalizacao + 0.3 * taker.p.attrs.passe) * f(taker) - 45) / 45, 0, 1);
    const gkq = keeper ? clamp((keeper.p.attrs.goleiro * f(keeper) - 50) / 50, 0, 1) : 0;
    const zones: PenaltyZone[] = ['LH', 'LL', 'CH', 'CL', 'RH', 'RL'];
    const zone = aim === 'auto' ? this.rng.weighted(zones, [0.6 + q * 0.8, 1, 0.25, 0.3, 0.6 + q * 0.8, 1]) : aim;
    const dv: Dive = dive === 'auto' ? this.rng.weighted(['L', 'C', 'R'] as Dive[], [0.42, 0.16, 0.42]) : dive;
    const high = zone.endsWith('H');
    const corner = zone[0] !== 'C';
    const pMiss = (high ? pr.missHigh : pr.missLow) * (1.5 - q * 0.8);
    const pPost = corner ? pr.post : pr.post * 0.3;
    const u = this.rng.next();
    if (u < pMiss) return { zone, dive: dv, outcome: 'miss' };
    if (u < pMiss + pPost) return { zone, dive: dv, outcome: 'post' };
    if (dv === zone[0]) {
      const base = zone[0] === 'C' ? pr.saveCenter : high ? pr.saveHigh : pr.saveLow;
      if (this.rng.chance(clamp(base * (0.6 + 0.8 * gkq), 0, 0.95))) return { zone, dive: dv, outcome: 'save' };
    }
    return { zone, dive: dv, outcome: 'goal' };
  }

  private doDecide(cmd: Extract<MatchCommand, { kind: 'decide' }>): boolean {
    const d = this.pending;
    if (!d || d.id !== cmd.id || d.side !== cmd.side) return false;
    const s = this.sides[d.side];
    if (d.kind === 'injury') {
      const x = s.players.find((y) => y.p.id === d.playerId);
      if (!x) return false;
      this.pending = undefined;
      this.applyInjury(d.side, x, cmd.choice === 'keep' ? 'keep' : cmd.choice);
      return true;
    }
    if (d.kind === 'desperate') {
      this.pending = undefined;
      if (cmd.choice === 'allin') {
        s.attMult = 1.1;
        s.defMult = 0.9;
        this.doSetTactics(d.side, { ...s.tactics, formation: s.tactics.formation === '5-4-1' ? '4-4-2' : s.tactics.formation, pressing: 0.9, lineHeight: 0.9, tempo: 0.95 });
        this.emit('tactic', d.side, this.ball.zone, { text: `${s.setup.name} parte para o tudo ou nada!` });
      } else {
        s.attMult = 0.97;
        s.defMult = 1.05;
        this.emit('tactic', d.side, this.ball.zone, { text: `${s.setup.name} prefere manter a organização e segurar o resultado.` });
      }
      s.dirty = true;
      return true;
    }
    if (d.kind === 'penalty') {
      const x = s.players.find((y) => y.p.id === cmd.choice && y.onPitch && y.slot !== 'GK');
      if (!x) return false;
      this.pending = undefined;
      this.beginPenalty(d.side, x.p.id);
      return true;
    }
    if (d.kind === 'aim' || d.kind === 'dive') {
      const zones = ['LH', 'LL', 'CH', 'CL', 'RH', 'RL'];
      const ok = cmd.choice === 'auto' || (d.kind === 'aim' ? zones.includes(cmd.choice) : ['L', 'C', 'R'].includes(cmd.choice));
      if (!ok) return false;
      this.pending = undefined;
      if (this.so && !this.so.over) {
        if (d.kind === 'aim') this.so.aim = cmd.choice as PenaltyZone | 'auto';
        else this.so.dive = cmd.choice as Dive | 'auto';
        this.finish();
      } else if (this.pen) {
        if (d.kind === 'aim') this.pen.aim = cmd.choice as PenaltyZone | 'auto';
        else this.pen.dive = cmd.choice as Dive | 'auto';
        this.advancePenalty();
      }
      return true;
    }
    // shootout (ordem dos batedores)
    s.shootoutOrder = cmd.order ?? [];
    this.pending = undefined;
    return true;
  }

  /** Escolha padrão quando o usuário não decide (simulação instantânea, fim do jogo automático). */
  private autoDecision(d: Decision): MatchCommand {
    const s = this.sides[d.side];
    if (d.kind === 'injury') {
      const repl = s.players
        .filter((y) => !y.onPitch && !y.played && y.p.position === (s.players.find((z) => z.p.id === d.playerId)?.p.position ?? 'MID'))
        .sort((a, b) => overall(b.p) - overall(a.p))[0];
      return { kind: 'decide', side: d.side, id: d.id, choice: repl && s.subs < MAX_SUBS ? repl.p.id : 'keep' };
    }
    if (d.kind === 'desperate') return { kind: 'decide', side: d.side, id: d.id, choice: 'hold' };
    if (d.kind === 'penalty') {
      const best = s.players
        .filter((x) => x.onPitch && x.slot !== 'GK')
        .sort((a, b) => b.p.attrs.finalizacao * (0.7 + 0.3 * b.cond / 100) - a.p.attrs.finalizacao * (0.7 + 0.3 * a.cond / 100))[0];
      return { kind: 'decide', side: d.side, id: d.id, choice: best?.p.id ?? '' };
    }
    if (d.kind === 'aim' || d.kind === 'dive') return { kind: 'decide', side: d.side, id: d.id, choice: 'auto' };
    return { kind: 'decide', side: d.side, id: d.id, choice: '', order: [] };
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
    // gritos: pressionar/bola longa quando perde, recuar quando vence
    if (s.shout === undefined || s.shout.until <= this.clock) {
      if (this.clock >= s.cooldownUntil) {
        if (diff < 0 && minute >= 55) this.doShout(side, minute >= 75 ? 'long' : 'press');
        else if (diff > 0 && minute >= 70) this.doShout(side, 'drop');
      }
    }
    // formação: abre o jogo quando precisa do gol, fecha quando defende o placar
    if (minute === 60 && diff < 0 && (s.tactics.formation === '5-4-1' || s.tactics.formation === '4-4-2')) {
      this.doSetTactics(side, { ...s.tactics, formation: '4-3-3' });
    } else if (minute === 80 && diff > 0 && s.tactics.formation !== '5-4-1') {
      this.doSetTactics(side, { ...s.tactics, formation: '5-4-1' });
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
      const f = ((1 - this.params.fatigueImpact) + this.params.fatigueImpact * (x.cond / 100)) * (x.injured ? 0.55 : 1);
      // encaixe e qualidade por setor só mudam com a posição/atributos: guardados no jogador
      if (x.fitSlot !== x.slot) {
        x.fitSlot = x.slot;
        x.fitV = fit(x.p, x.slot);
      }
      const fitV = x.fitV as number;
      if (x.slot === 'GK') {
        gk = x.p.attrs.goleiro * f * fitV;
        continue;
      }
      const q = (x.q ??= sectorQuality(x.p.attrs));
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
    const mor = 1 + s.morale;
    s.sectors = { def: sector(0) * mor * s.defMult, mid: sector(1) * mor, att: sector(2) * mor * s.attMult, speed: speedW > 0 ? speedSum / speedW : 50, gk };
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
    const fa = this.fx(aSide);
    const fd = this.fx(dSide);
    const tempoAvg = (fa.tempo + fd.tempo) / 2;
    const dur = (this.params.stepMinutes / this.eraFactor / (0.8 + 0.4 * tempoAvg)) * (this.ball.mode === 'build' ? 1 : 0.6);
    this.clock += dur;
    a.stats.possTime += dur;
    this.momentumLog.push({ t: this.clock, side: aSide, w: dur * (this.ball.zone === 'ATT' ? 2 : this.ball.zone === 'MID' ? 1 : 0.5) });
    while (this.momentumLog.length && (this.momentumLog[0] as { t: number }).t < this.clock - 10) this.momentumLog.shift();

    const zone = this.ball.zone;
    const pressD = fd.pressing;
    const lineD = fd.lineHeight;
    const precision = (1 - 0.1 * (fa.tempo - 0.5)) * (1 + fa.prec);

    // bola longa a partir da defesa
    if (zone === 'DEF' && this.ball.mode === 'build') {
      const pLong = this.params.longBallBase * (0.5 + 1.0 * fa.tempo) * fa.longMult * (0.6 + 0.9 * lineD);
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
      A = (0.6 * sa.mid + 0.4 * sa.att) * precision * (1 + this.params.tactics.attackLine * (fa.lineHeight - 0.5));
      B = (0.5 * sd.mid + 0.5 * sd.def) * (1 + 0.2 * (pressD - 0.5)) * (1 + 0.1 * (lineD - 0.5));
      next = 'ATT';
    } else {
      next = 'BOX';
      if (this.ball.mode === 'build') {
        A = sa.att * precision * (1 + this.params.tactics.attackTempo * (fa.tempo - 0.5));
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
    const pFoul = this.params.foulBase * (0.7 + 0.6 * pressD) * (0.8 + 0.4 * fd.tempo) * (d.calm ? 0.7 : 1);
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
    let mode: Mode = 'build';
    let zone: FieldZone = mirrored;
    if (allowCounter && from !== 'DEF') {
      const pCounter =
        this.params.counterBase *
        (0.6 + 1.2 * this.fx(loser).lineHeight + 0.5 * this.fx(loser).pressing) *
        (0.6 + 0.8 * this.fx(winner).tempo) *
        (1 - this.params.tactics.pressRecover + 2 * this.params.tactics.pressRecover * this.fx(winner).pressing) *
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
    } else if (this.rng.chance(this.params.yellowPerFoul * (0.8 + 0.4 * this.fx(fouler).pressing) * (F.calm ? 0.6 : 1))) {
      culprit.yellows++;
      F.stats.yellows++;
      this.addRating(culprit, -0.3);
      this.emit('yellow', fouler, evZone, { playerId: culprit.p.id, text: narrateYellow({ ...this.ctx(fouler), player: culprit.p.name }) });
      if (culprit.yellows >= 2) this.sendOff(fouler, culprit);
    }
    // consequência: posse mantida; falta perto da área vira chute; pênalti
    if (inFinalDuel && this.rng.chance(this.params.penaltyPerBoxFoul)) {
      this.awardPenalty(victim);
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

  private shoot(side: Side, type: ShotType, quality: number, forcedShooter?: string): void {
    const S = this.sides[side];
    const D = this.sides[other(side)];
    const isPen = type === 'penalti';
    const slotW = type === 'cruzamento' || type === 'bola-parada' ? SET_PIECE_SLOT_WEIGHT : SHOOTER_SLOT_WEIGHT;
    const forced = forcedShooter ? S.players.find((x) => x.p.id === forcedShooter && x.onPitch) : undefined;
    const shooter = forced ?? this.pickPlayer(side, (x) => slotW[x.slot] * Math.pow(Math.max(1, x.p.attrs.finalizacao), 2) * (x.p.trait && SHOOTER_TRAITS.has(x.p.trait) ? 1.4 : 1));
    const assister = isPen || type === 'bola-parada' ? undefined : this.pickPlayer(side, (x) => (x === shooter ? 0 : ASSIST_SLOT_WEIGHT[x.slot] * Math.pow(Math.max(1, x.p.attrs.passe), 2) * (x.p.trait && ASSIST_TRAITS.has(x.p.trait) ? 1.4 : 1)));
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
    let roll: number;
    let penInfo: PenaltyInfo | undefined;
    if (isPen) {
      penInfo = this.penaltyKick(shooter, keeper, this.pen?.aim ?? 'auto', this.pen?.dive ?? 'auto');
      // reaproveita os ramos abaixo: cada resultado cai na faixa correspondente
      roll =
        penInfo.outcome === 'goal' ? 0 :
        penInfo.outcome === 'save' ? pGoal + (pOnTarget - pGoal) / 2 :
        penInfo.outcome === 'post' ? pOnTarget + (1 - pOnTarget) * this.params.postShare / 2 :
        pOnTarget + (1 - pOnTarget) * (this.params.postShare + (1 - this.params.postShare) / 2);
    } else roll = this.rng.next();
    const pen = penInfo ? { penalty: penInfo } : {};
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
        ...pen,
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
        ...pen,
        text: (hard ? narrateHardSave : narrateSave)({ ...names, other: keeper?.p.name ?? 'o goleiro' }),
      });
    } else if ((roll - pOnTarget) / (1 - pOnTarget) < this.params.postShare) {
      this.addRating(shooter, 0);
      this.emit('post', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, ...pen, text: narratePost(names) });
    } else if (xg >= this.params.bigChanceXg) {
      this.addRating(shooter, -0.25);
      this.emit('big-miss', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, ...pen, text: narrateBigMiss(names) });
    } else {
      this.addRating(shooter, -0.05);
      this.emit('miss', side, 'BOX', { playerId: shooter.p.id, shotType: type, xg, ...pen, text: narrateMiss(names) });
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
    if (this.knockout && this.score[0] === this.score[1]) {
      if (!this.so) {
        // o usuário escolhe a ordem dos batedores antes da disputa
        for (const side of [0, 1] as Side[]) {
          const s = this.sides[side];
          if (!s.setup.ai && s.shootoutOrder === undefined && !this.pending) {
            this.open({ kind: 'shootout', side }, false);
            return;
          }
        }
        this.initShootout();
      }
      this.stepShootout();
      if (!this.so || !this.so.over) return; // espera uma escolha de canto ou de mergulho do usuário
    }
    this.done = true;
    this.emit('fulltime', this.ball.team, 'MID', {
      text: `Fim de jogo: ${this.scoreText()}${this.shootout ? ` (pênaltis ${this.shootout[0]}-${this.shootout[1]})` : ''}.`,
    });
  }

  private initShootout(): void {
    const takers = [0, 1].map((i) => {
      const s = this.sides[i as Side];
      const field = s.players.filter((x) => x.onPitch && x.slot !== 'GK').sort((a, b) => b.p.attrs.finalizacao - a.p.attrs.finalizacao);
      // ordem escolhida pelo usuário primeiro; o resto pelo padrão
      const chosen = (s.shootoutOrder ?? []).map((id) => field.find((x) => x.p.id === id)).filter((x): x is PState => !!x);
      return [...chosen, ...field.filter((x) => !chosen.includes(x))];
    });
    const keepers = [0, 1].map((i) => this.sides[i as Side].players.find((x) => x.onPitch && x.slot === 'GK'));
    this.so = { takers, keepers, res: [0, 0], taken: [0, 0], k: 0, over: false };
  }

  /** Cobra até acabar a disputa ou até faltar uma escolha do usuário (canto ao bater, lado ao defender). */
  private stepShootout(): void {
    const so = this.so;
    if (!so) return;
    let guard = 0;
    while (!so.over && guard++ < 80) {
      const side = (so.k % 2) as Side;
      const defender = other(side);
      const list = so.takers[side] as PState[];
      const taker = list[so.taken[side] % list.length] as PState;
      if (!this.sides[side].setup.ai && so.aim === undefined) {
        this.open({ kind: 'aim', side, takerId: taker.p.id, shootout: true }, false);
        return;
      }
      if (!this.sides[defender].setup.ai && so.dive === undefined) {
        this.open({ kind: 'dive', side: defender, takerId: taker.p.id, shootout: true }, false);
        return;
      }
      const out = this.penaltyKick(taker, so.keepers[defender], so.aim ?? 'auto', so.dive ?? 'auto');
      so.aim = undefined;
      so.dive = undefined;
      so.taken[side]++;
      so.k++;
      const scored = out.outcome === 'goal';
      if (scored) so.res[side]++;
      this.emit('penalty-shootout', side, 'BOX', {
        playerId: taker.p.id,
        scored,
        penalty: out,
        text: narrateShootoutKick({ ...this.ctx(side), player: taker.p.name, scored }),
      });
      const [t0, t1] = so.taken;
      const [r0, r1] = so.res;
      if (t0 <= 5 && t1 <= 5) {
        // antes de completar as 5 cobranças de cada um: decidiu se um não alcança mais o outro
        if (r0 > r1 + (5 - t1) || r1 > r0 + (5 - t0)) so.over = true;
      } else if (t0 === t1 && r0 !== r1) so.over = true; // morte súbita: rodada completa com diferença
      if (!so.over && t0 > 25 && t0 === t1) {
        // salvaguarda contra disputas infinitas
        so.res[this.rng.chance(0.5) ? 0 : 1]++;
        so.over = true;
      }
      if (so.over) this.shootout = [so.res[0], so.res[1]];
    }
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

  private momentum(): number {
    let a = 0;
    let b = 0;
    for (const m of this.momentumLog) {
      if (m.side === 0) a += m.w;
      else b += m.w;
    }
    return a + b > 0 ? a / (a + b) : 0.5;
  }

  private statsOf(): [TeamMatchStats, TeamMatchStats] {
    return [0, 1].map((i): TeamMatchStats => {
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
  }

  /** Notas: com `final`, inclui o bônus do resultado e de jogo sem sofrer gols. */
  private ratingsNow(final: boolean): Record<string, number> {
    const ratings: Record<string, number> = {};
    for (const side of [0, 1] as Side[]) {
      const s = this.sides[side];
      const mine = this.score[side];
      const theirs = this.score[other(side)];
      const resultBonus = final ? (mine > theirs ? 0.3 : mine < theirs ? -0.2 : 0) : 0;
      for (const x of s.players) {
        if (!x.played) continue;
        let r = x.rating + resultBonus;
        if (final && theirs === 0 && (x.slot === 'GK' || x.slot === 'CB' || x.slot === 'LB' || x.slot === 'RB' || x.slot === 'WB')) r += 0.4;
        ratings[x.p.id] = Math.round(clamp(r, 3, 10) * 10) / 10;
      }
    }
    return ratings;
  }

  report(): MatchReport {
    const stats = this.statsOf();
    const ratings = this.ratingsNow(true);
    const finalCondition: Record<string, number> = {};
    for (const s of this.sides) for (const x of s.players) finalCondition[x.p.id] = Math.round(x.cond * 10) / 10;

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
    if (c.cmd.kind === 'decide') {
      // a decisão abre sozinha (minuto novo, pênalti, fim de jogo): avança até ela aparecer
      while (!sim.pendingDecision && !sim.finished) sim.playUntil(Math.max(c.at, sim.clockExact) + 1e-6);
    } else {
      // o intervalo interrompe o playUntil; repete até o relógio exato do comando
      while (sim.clockExact < c.at && !sim.finished && !sim.pendingDecision) sim.playUntil(c.at);
    }
    sim.execute(c.cmd);
  }
  return sim.playToEnd();
}

/** Simula a partida inteira de uma vez. */
export function simulateMatch(setups: [TeamSetup, TeamSetup], opts: MatchOptions): MatchReport {
  return new MatchSimulator(setups, opts).playToEnd();
}
