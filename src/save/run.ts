/**
 * A Copa em andamento (ou o cenário) como vai para o save: o `Tournament` inteiro mais o contexto do modo.
 * Validada campo a campo, igual ao resto do save: o arquivo importado é entrada não confiável.
 */
import type { Tournament, MatchRecord, MatchResult, Stage } from '../engine/tournament';
import type { MatchCommand } from '../engine/match';
import type { NationEra, Player } from '../engine/types';
import { all, bool, color, date, id, idList, int, isObj, lineup, num, playerName, record, tactics, text } from './guards';

export type RunMode = 'ready' | 'draft' | 'career' | 'daily' | 'scenario';

export interface Run {
  /** Versão do formato da Copa salva (independe da versão do arquivo de save). */
  v: 1;
  savedAt: string;
  mode: RunMode;
  tournament: Tournament;
  /** Contexto do modo: data do desafio, cenário ou desafio de amigo (seleção, recorte, seed, pontos do amigo). */
  dailyDate?: string;
  scenarioId?: string;
  challenge?: { nationId: string; cut: Tournament['cut']; seed: number; points?: number; stage?: string };
}

const STAGES: readonly string[] = ['G1', 'G2', 'G3', 'R16', 'QF', 'SF', 'F', 'DONE'];
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const SLOTS = ['GK', 'CB', 'LB', 'RB', 'WB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const DECADES = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const CONTINENTS = ['EU', 'SA', 'AF', 'AS', 'NA', 'OC'];
const STYLES = ['retranca', 'posse', 'contra-ataque', 'jogo-direto', 'ofensivo', 'equilibrado'];
const MODES: readonly string[] = ['ready', 'draft', 'career', 'daily', 'scenario'];
const SHOUTS = ['press', 'drop', 'long', 'short'];
const TONES = ['motivate', 'demand', 'calm'];

const side = (v: unknown): 0 | 1 | undefined => (v === 0 || v === 1 ? v : undefined);
const stage = (v: unknown): Stage | undefined => (typeof v === 'string' && STAGES.includes(v) ? (v as Stage) : undefined);
const pair = <T>(v: unknown, g: (x: unknown) => T | undefined): [T, T] | undefined => {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const a = g(v[0]);
  const b = g(v[1]);
  return a === undefined || b === undefined ? undefined : [a, b];
};
const cut = (v: unknown): Tournament['cut'] | undefined => (v === 'all' ? 'all' : typeof v === 'number' && DECADES.includes(v) ? (v as Tournament['cut']) : undefined);
const nums = (max: number) => (v: unknown) => record(v, max, id, (x) => num(x, -1e6, 1e6));

function player(v: unknown): Player | undefined {
  if (!isObj(v) || !POSITIONS.includes(v.position as string) || !SLOTS.includes(v.slot as string) || !isObj(v.attrs)) return undefined;
  const a = v.attrs;
  const attrs = all({ defesa: num(a.defesa, 0, 100), passe: num(a.passe, 0, 100), drible: num(a.drible, 0, 100), finalizacao: num(a.finalizacao, 0, 100), fisico: num(a.fisico, 0, 100), velocidade: num(a.velocidade, 0, 100), goleiro: num(a.goleiro, 0, 100) });
  const p = all({ id: id(v.id), name: playerName(v.name), nationality: text(v.nationality, 8), position: v.position as Player['position'], slot: v.slot as Player['slot'], age: int(v.age, 14, 60), style: text(v.style, 60), attrs, condition: num(v.condition, 0, 100) }) as Player | undefined;
  if (!p) return undefined;
  if (v.star === true) p.star = true;
  if (typeof v.trait === 'string') {
    const t = text(v.trait, 60);
    if (t === undefined) return undefined;
    p.trait = t;
  }
  return p;
}

/** Time montado no draft (a única seleção que carrega o próprio elenco). */
export function customNation(v: unknown): NationEra | undefined {
  if (!isObj(v) || v.custom !== true || !DECADES.includes(v.decade as number) || !CONTINENTS.includes(v.continent as string) || !STYLES.includes(v.playStyle as string)) return undefined;
  if (!isObj(v.colors) || !isObj(v.record) || !Array.isArray(v.span) || !Array.isArray(v.customSquad) || v.customSquad.length > 60) return undefined;
  const squad = v.customSquad.map(player);
  if (!squad.every((p): p is Player => p !== undefined)) return undefined;
  const r = v.record;
  const n = all({
    id: id(v.id), country: text(v.country, 60), decade: v.decade as NationEra['decade'], continent: v.continent as NationEra['continent'], elo: num(v.elo, 0, 3000), strength: num(v.strength, 0, 100),
    playStyle: v.playStyle as NationEra['playStyle'], goalsFor: num(v.goalsFor, 0, 20), goalsAgainst: num(v.goalsAgainst, 0, 20),
    colors: all({ primary: color(v.colors.primary), secondary: color(v.colors.secondary) }), code: text(v.code, 8), culture: text(v.culture, 20), matches: int(v.matches, 0, 1e6),
    kind: v.kind === 'peak' ? 'peak' : v.kind === 'decade' ? 'decade' : undefined, span: pair(v.span, (x) => int(x, 1800, 2100)), percentile: num(v.percentile, 0, 100),
    record: all({ w: int(r.w, 0, 1e6), d: int(r.d, 0, 1e6), l: int(r.l, 0, 1e6), gf: int(r.gf, 0, 1e6), ga: int(r.ga, 0, 1e6) }),
  }) as NationEra | undefined;
  if (!n) return undefined;
  n.custom = true;
  n.customSquad = squad;
  if (typeof v.summary === 'string') {
    const s = text(v.summary, 800);
    if (s === undefined) return undefined;
    n.summary = s;
  }
  return n;
}

function command(v: unknown): MatchCommand | undefined {
  if (!isObj(v)) return undefined;
  const sd = side(v.side);
  if (sd === undefined) return undefined;
  switch (v.kind) {
    case 'sub': {
      const outId = id(v.outId);
      const inId = id(v.inId);
      return outId && inId ? { kind: 'sub', side: sd, outId, inId } : undefined;
    }
    case 'tactics': {
      const t = tactics(v.tactics);
      return t ? { kind: 'tactics', side: sd, tactics: t } : undefined;
    }
    case 'shout':
      return SHOUTS.includes(v.shout as string) ? { kind: 'shout', side: sd, shout: v.shout as never } : undefined;
    case 'talk':
      return TONES.includes(v.tone as string) ? { kind: 'talk', side: sd, tone: v.tone as never } : undefined;
    case 'decide': {
      const did = int(v.id, 0, 1000);
      const choice = text(v.choice, 64);
      if (did === undefined || choice === undefined) return undefined;
      if (v.order === undefined) return { kind: 'decide', side: sd, id: did, choice };
      const order = idList(v.order, 23);
      return order ? { kind: 'decide', side: sd, id: did, choice, order } : undefined;
    }
    default:
      return undefined;
  }
}

function matchResult(v: unknown): MatchResult | undefined {
  if (!isObj(v)) return undefined;
  const goals = Array.isArray(v.goals) && v.goals.length <= 40 ? v.goals.map((g) => (isObj(g) ? all({ playerId: id(g.playerId), team: id(g.team), minute: num(g.minute, 0, 140) }) : undefined)) : undefined;
  if (!goals || !goals.every((g) => g !== undefined)) return undefined;
  const teams = pair(v.teams, id);
  const score = pair(v.score, (x) => int(x, 0, 60));
  const shootout = v.shootout === undefined ? undefined : pair(v.shootout, (x) => int(x, 0, 60));
  if (v.shootout !== undefined && !shootout) return undefined;
  const r = all({ id: text(v.id, 24), stage: stage(v.stage), teams, score, extraTime: bool(v.extraTime), goals }) as MatchResult | undefined;
  if (r && shootout) r.shootout = shootout;
  return r;
}

function matchRecord(v: unknown): MatchRecord | undefined {
  if (!isObj(v) || !Array.isArray(v.commands) || v.commands.length > 400 || !Array.isArray(v.lineups) || v.lineups.length !== 2) return undefined;
  const cmds = v.commands.map((c) => (isObj(c) ? all({ at: num(c.at, 0, 200), cmd: command(c.cmd) }) : undefined));
  if (!cmds.every((c) => c !== undefined)) return undefined;
  const lineups = pair(v.lineups, lineup);
  const r = all({ engineVersion: int(v.engineVersion, 0, 1e6), fixtureId: text(v.fixtureId, 24), stage: stage(v.stage), seed: int(v.seed, 0, 0xffffffff), knockout: bool(v.knockout), teams: pair(v.teams, id), userSide: side(v.userSide), lineups, cond: nums(100)(v.cond), commands: cmds }) as MatchRecord | undefined;
  if (!r) return undefined;
  if (v.custom !== undefined) {
    const c = customNation(v.custom);
    if (!c) return undefined;
    r.custom = c;
  }
  return r;
}

function tournament(v: unknown): Tournament | undefined {
  if (!isObj(v) || !Array.isArray(v.groups) || v.groups.length > 8 || !Array.isArray(v.results) || v.results.length > 100 || !Array.isArray(v.userMatches) || v.userMatches.length > 8 || !isObj(v.stats)) return undefined;
  const groups = v.groups.map((g) => idList(g, 4));
  const results = v.results.map(matchResult);
  const userMatches = v.userMatches.map(matchRecord);
  if (!groups.every((g) => g !== undefined) || !results.every((r) => r !== undefined) || !userMatches.every((m) => m !== undefined)) return undefined;
  const squads = record(v.squads, 40, id, (x) => idList(x, 23));
  const t = all({
    seed: int(v.seed, 0, 0xffffffff), userNationId: id(v.userNationId), cut: cut(v.cut), participants: idList(v.participants, 32), squads, userLineup: lineup(v.userLineup),
    cond: nums(2000)(v.cond), groups: groups as string[][], results: results as MatchResult[], stage: stage(v.stage), userMatches: userMatches as MatchRecord[],
    stats: all({ goals: nums(2000)(v.stats.goals), ratingSum: nums(2000)(v.stats.ratingSum), apps: nums(2000)(v.stats.apps) }),
  }) as Tournament | undefined;
  if (!t) return undefined;
  if (v.custom !== undefined) {
    const c = customNation(v.custom);
    if (!c) return undefined;
    t.custom = c;
  }
  if (v.champion !== undefined) {
    const c = id(v.champion);
    if (!c) return undefined;
    t.champion = c;
  }
  if (v.scenario !== undefined) {
    const sc = isObj(v.scenario) ? all({ id: id(v.scenario.id), opponent: id(v.scenario.opponent) }) : undefined;
    if (!sc) return undefined;
    t.scenario = sc;
  }
  return t;
}

export function run(v: unknown): Run | undefined {
  if (!isObj(v) || v.v !== 1 || !MODES.includes(v.mode as string)) return undefined;
  const t = tournament(v.tournament);
  const out = all({ v: 1 as const, savedAt: text(v.savedAt, 40), mode: v.mode as RunMode, tournament: t }) as Run | undefined;
  if (!out) return undefined;
  if (v.dailyDate !== undefined) {
    const d = date(v.dailyDate);
    if (!d) return undefined;
    out.dailyDate = d;
  }
  if (v.scenarioId !== undefined) {
    const s = id(v.scenarioId);
    if (!s) return undefined;
    out.scenarioId = s;
  }
  if (v.challenge !== undefined) {
    const c = isObj(v.challenge) ? v.challenge : undefined;
    const ch = c ? all({ nationId: id(c.nationId), cut: cut(c.cut), seed: int(c.seed, 0, 0xffffffff) }) : undefined;
    if (!c || !ch) return undefined;
    const points = c.points === undefined ? undefined : int(c.points, 0, 100000);
    if (c.points !== undefined && points === undefined) return undefined;
    const stg = c.stage === undefined ? undefined : text(c.stage, 40);
    out.challenge = { ...ch, ...(points !== undefined ? { points } : {}), ...(stg ? { stage: stg } : {}) } as Run['challenge'];
  }
  return out;
}

/** Todas as seleções citadas existem (as do mundo ou o time do draft)? */
export function runIds(r: Run): string[] {
  const t = r.tournament;
  const ids = [t.userNationId, ...t.participants, ...Object.keys(t.squads), ...t.groups.flat(), ...t.results.flatMap((x) => x.teams), ...(t.champion ? [t.champion] : []), ...(t.scenario ? [t.scenario.opponent] : []), ...(r.challenge ? [r.challenge.nationId] : [])];
  return ids.filter((x) => x !== t.custom?.id);
}
