import { FORMATION_SLOTS } from '../engine/formations';
import { fit } from '../engine/lineup';
import { overall } from '../engine/player';
import { Rng, hashSeed } from '../engine/prng';
import type { Formation, NationEra, Player, Slot, World } from '../engine/types';
import { generateSquad } from './squad';
import { squadOf } from './squads';
import { strengthFromElo } from './world';

/**
 * Draft por sorteio ("Monte a sua"): a cada rodada o jogo sorteia uma seleção-era (todas com a mesma chance, então as
 * fracas aparecem muito) e o usuário escolhe 1 jogador dela. Tudo sai de uma seed e de um log de escolhas, então o draft
 * inteiro é reproduzível (replayDraft).
 */
export const DRAFT_REROLLS = 3;
export const DRAFT_MEMORY_REROLLS = 1;
export const RESERVES = 7;
export const SQUAD_TOTAL = 23;

export interface DraftConfig {
  seed: number;
  name: string;
  colors: [string, string];
  formation: Formation;
  /** Modo "Memória": notas escondidas e só 1 troca de sorteio. */
  memory: boolean;
}

export type DraftEntry = { type: 'reroll' } | { type: 'pick'; playerId: string; /** índice do slot da formação; null = reserva */ slot: number | null };

export interface DraftState {
  config: DraftConfig;
  rngState: number;
  /** Seleção-era sorteada agora. */
  roll: string;
  rerollsLeft: number;
  /** Titulares por slot da formação (null = vazio). */
  starters: (Player | null)[];
  reserves: Player[];
  phase: 'starters' | 'reserves' | 'done';
  log: DraftEntry[];
}

const rngOf = (state: number) => {
  const r = new Rng(0);
  r.setState(state);
  return r;
};

function drawRoll(world: World, rng: Rng, avoid?: string): string {
  let id = (rng.pick(world.nations) as NationEra).id;
  if (avoid && world.nations.length > 1) while (id === avoid) id = (rng.pick(world.nations) as NationEra).id;
  return id;
}

export function startDraft(world: World, config: DraftConfig): DraftState {
  const rng = new Rng(hashSeed(`draft:${config.seed}`));
  const roll = drawRoll(world, rng);
  return {
    config,
    rngState: rng.getState(),
    roll,
    rerollsLeft: config.memory ? DRAFT_MEMORY_REROLLS : DRAFT_REROLLS,
    starters: new Array(11).fill(null),
    reserves: [],
    phase: 'starters',
    log: [],
  };
}

export function rollSquad(world: World, state: DraftState): Player[] {
  const n = world.nations.find((x) => x.id === state.roll);
  return n ? squadOf(n) : [];
}

export function pickedIds(state: DraftState): Set<string> {
  return new Set([...state.starters.filter((p): p is Player => !!p).map((p) => p.id), ...state.reserves.map((p) => p.id)]);
}

/** Pode este jogador ocupar este slot? Goleiro só no gol e gol só com goleiro; os demais com encaixe reduzido fora da posição. */
export function canPlace(p: Player, slot: Slot): boolean {
  return (slot === 'GK') === (p.position === 'GK');
}

export function pickError(world: World, state: DraftState, playerId: string, slot: number | null): string | undefined {
  if (state.phase === 'done') return 'O draft já terminou.';
  const p = rollSquad(world, state).find((x) => x.id === playerId);
  if (!p) return 'Esse jogador não está na seleção sorteada.';
  if (pickedIds(state).has(playerId)) return 'Jogador já escolhido.';
  if (state.phase === 'starters') {
    if (slot === null) return 'Escolha uma posição vazia da formação.';
    const slots = FORMATION_SLOTS[state.config.formation];
    if (state.starters[slot] !== null || slot < 0 || slot >= slots.length) return 'Essa posição já está ocupada.';
    if (!canPlace(p, slots[slot] as Slot)) return p.position === 'GK' ? 'Goleiro só pode jogar no gol.' : 'Só um goleiro pode jogar no gol.';
  } else if (slot !== null) return 'Reservas não ocupam posição da formação.';
  return undefined;
}

/** Escolhe 1 jogador da seleção sorteada e sorteia a próxima. Devolve um novo estado (o anterior não muda). */
export function pick(world: World, state: DraftState, playerId: string, slot: number | null): DraftState {
  const err = pickError(world, state, playerId, slot);
  if (err) throw new Error(err);
  const p = rollSquad(world, state).find((x) => x.id === playerId) as Player;
  const next: DraftState = { ...state, starters: [...state.starters], reserves: [...state.reserves], log: [...state.log, { type: 'pick', playerId, slot }] };
  if (state.phase === 'starters') next.starters[slot as number] = p;
  else next.reserves.push(p);
  if (next.phase === 'starters' && next.starters.every(Boolean)) next.phase = 'reserves';
  if (next.phase === 'reserves' && next.reserves.length >= RESERVES) next.phase = 'done';
  if (next.phase !== 'done') {
    const rng = rngOf(next.rngState);
    next.roll = drawRoll(world, rng);
    next.rngState = rng.getState();
  }
  return next;
}

/** Troca o sorteio (limitado por draft). */
export function reroll(world: World, state: DraftState): DraftState {
  if (state.phase === 'done' || state.rerollsLeft <= 0) throw new Error('Sem trocas de sorteio restantes.');
  const rng = rngOf(state.rngState);
  const roll = drawRoll(world, rng, state.roll);
  return { ...state, roll, rngState: rng.getState(), rerollsLeft: state.rerollsLeft - 1, log: [...state.log, { type: 'reroll' }] };
}

/** Reproduz um draft a partir da configuração e do log de escolhas. */
export function replayDraft(world: World, config: DraftConfig, log: readonly DraftEntry[]): DraftState {
  let s = startDraft(world, config);
  for (const e of log) s = e.type === 'reroll' ? reroll(world, s) : pick(world, s, e.playerId, e.slot);
  return s;
}

// ---------- fechamento do elenco ----------

const FILLER_QUALITY_ELO = 1410; // jogadores medianos (qualidade ~46)

/** Completa os 23 com jogadores medianos gerados (cobrindo goleiros e as posições menos povoadas) e monta o time. */
export function finalizeDraft(state: DraftState, id = `XI-${state.config.seed}`): NationEra {
  if (state.phase !== 'done') throw new Error('O draft ainda não terminou.');
  const squad: Player[] = [...(state.starters as Player[]), ...state.reserves].map((p) => ({ ...p }));
  const need = SQUAD_TOTAL - squad.length;
  const pool = generateSquad({ nationId: `FILL-${state.config.seed}`, culture: 'portugues', decade: 1990, elo: FILLER_QUALITY_ELO, playStyle: 'equilibrado' });
  const used = new Set<string>();
  const names = new Set(squad.map((p) => p.name));
  const takeFill = (pred: (p: Player) => boolean): Player | undefined => pool.find((p) => !used.has(p.id) && !names.has(p.name) && pred(p));
  const count = (pos: string) => squad.filter((p) => p.position === pos).length;
  for (let i = 0; i < need; i++) {
    let want: Player['position'];
    if (count('GK') < 2) want = 'GK';
    else {
      const target = { DEF: 7, MID: 7, FWD: 5 } as const;
      want = (['DEF', 'MID', 'FWD'] as const).map((pos) => ({ pos, gap: target[pos] - count(pos) })).sort((a, b) => b.gap - a.gap)[0]!.pos;
    }
    const f = takeFill((p) => p.position === want) ?? takeFill(() => true);
    if (!f) break;
    used.add(f.id);
    names.add(f.name);
    squad.push({ ...f, id: `${id}-F${i + 1}`, nationality: 'XI' });
  }
  // nota do time: média dos 11 melhores, convertida para Elo pela mesma escala usada para gerar os elencos
  const top = squad.map((p) => overall(p)).sort((a, b) => b - a).slice(0, 11);
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  const elo = Math.round((1500 + (avg - 50) / 0.045) * 10) / 10;
  return {
    id,
    code: 'XI',
    culture: 'portugues',
    country: state.config.name.trim() || 'Meu Time',
    decade: 2020,
    continent: 'SA',
    elo,
    strength: Math.round(strengthFromElo(elo) * 10000) / 10000,
    playStyle: 'equilibrado',
    goalsFor: 1.3,
    goalsAgainst: 1.1,
    colors: { primary: state.config.colors[0], secondary: state.config.colors[1] },
    matches: 0,
    custom: true,
    customSquad: squad,
  };
}

// ---------- robô guloso (balanceamento) ----------

/** Escolha do robô guloso: o melhor jogador disponível (nota x encaixe) para uma vaga vazia; reserva: a melhor nota. */
export function greedyChoice(world: World, state: DraftState): { playerId: string; slot: number | null; value: number } | undefined {
  const taken = pickedIds(state);
  const slots = FORMATION_SLOTS[state.config.formation];
  let best: { playerId: string; slot: number | null; value: number } | undefined;
  for (const p of rollSquad(world, state)) {
    if (taken.has(p.id)) continue;
    if (state.phase === 'reserves') {
      const v = overall(p);
      if (!best || v > best.value) best = { playerId: p.id, slot: null, value: v };
      continue;
    }
    slots.forEach((slot, i) => {
      if (state.starters[i] !== null || !canPlace(p, slot)) return;
      const v = overall(p) * fit(p, slot);
      if (!best || v > best.value) best = { playerId: p.id, slot: i, value: v };
    });
  }
  return best;
}

/** Draft completo do robô guloso: troca o sorteio enquanto a melhor opção for fraca (abaixo de `rerollBelow`). */
export function greedyDraft(world: World, config: DraftConfig, rerollBelow = 60): DraftState {
  let s = startDraft(world, config);
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 200) {
    const c = greedyChoice(world, s);
    if (s.rerollsLeft > 0 && (!c || c.value < rerollBelow)) {
      s = reroll(world, s);
      continue;
    }
    if (!c) throw new Error('Sorteio sem jogador válido e sem trocas restantes.');
    s = pick(world, s, c.playerId, c.slot);
  }
  return s;
}
