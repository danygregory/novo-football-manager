/** Tipos compartilhados: dados do mundo, tática, partida e persistência. Sem dependência de DOM. */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Posição fina usada nas formações. */
export type Slot = 'GK' | 'CB' | 'LB' | 'RB' | 'WB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';

export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '5-4-1';

export type Zone = 'DEF' | 'MID' | 'ATT' | 'BOX';

export type Continent = 'EU' | 'SA' | 'AF' | 'AS' | 'NA' | 'OC';

export type Decade = 1930 | 1940 | 1950 | 1960 | 1970 | 1980 | 1990 | 2000 | 2010 | 2020;

export type PlayStyle =
  | 'retranca'
  | 'posse'
  | 'contra-ataque'
  | 'jogo-direto'
  | 'ofensivo'
  | 'equilibrado';

/** Atributos de 1 a 99. */
export interface Attributes {
  defesa: number;
  passe: number;
  drible: number;
  finalizacao: number;
  fisico: number;
  velocidade: number;
  /** Só relevante para goleiros; demais ficam baixos. */
  goleiro: number;
}

export interface Player {
  id: string;
  name: string;
  nationality: string;
  position: Position;
  slot: Slot;
  age: number;
  /** Estilo coerente com a era, ex.: "ponta driblador". */
  style: string;
  attrs: Attributes;
  /** 0 a 100; cai com jogos, recupera entre eles. */
  condition: number;
}

export interface NationEra {
  id: string; // ex.: "BRA-1970"
  country: string;
  decade: Decade;
  continent: Continent;
  /** Elo médio da década. */
  elo: number;
  /** Força derivada do Elo: 10^((elo - 1800) / 400). */
  strength: number;
  playStyle: PlayStyle;
  /** Gols marcados/sofridos por jogo na década (contra adversários com Elo >= 1650 quando há amostra). */
  goalsFor: number;
  goalsAgainst: number;
  colors: { primary: string; secondary: string };
  /** Código do país (prefixo do id). */
  code: string;
  /** Cultura dos nomes gerados para os jogadores. */
  culture: string;
  /** Jogos da seleção na década (amostra do Elo). */
  matches: number;
  /** Time montado no draft: elenco guardado aqui (as seleções históricas geram o elenco sob demanda). */
  custom?: boolean;
  customSquad?: Player[];
}

export interface DecadeStats {
  decade: Decade;
  /** Jogos da década na base inteira. */
  matches: number;
  /** Média de gols por jogo (soma dos dois times) em toda a base. */
  goalsPerMatch: number;
  /** Mesma média, só em jogos entre seleções com Elo >= 1650 (referência da calibração). */
  goalsPerMatchCompetitive: number;
  /** Elo médio das seleções-era da década (com amostra mínima). */
  meanElo: number;
}

export interface World {
  version: number;
  generatedFrom: string;
  decades: DecadeStats[];
  nations: NationEra[];
}

export interface Tactics {
  formation: Formation;
  /** 0..1 */
  pressing: number;
  /** 0..1 (0 = linha baixa, 1 = linha alta) */
  lineHeight: number;
  /** 0..1 (0 = cadenciado, 1 = acelerado) */
  tempo: number;
}

export interface Lineup {
  nationId: string;
  tactics: Tactics;
  /** 11 ids de titulares, na ordem dos slots da formação. */
  starters: string[];
  /** Ids do banco (até 12 restantes dos 23 convocados). */
  bench: string[];
}

export type ShotType = 'trabalhada' | 'contra-ataque' | 'cruzamento' | 'bola-parada' | 'penalti';

export type EventType =
  | 'kickoff'
  | 'pass-key'
  | 'shot'
  | 'goal'
  | 'save'
  | 'hard-save'
  | 'miss'
  | 'big-miss'
  | 'post'
  | 'offside'
  | 'foul'
  | 'yellow'
  | 'red'
  | 'sub'
  | 'injury'
  | 'tactic'
  | 'halftime'
  | 'fulltime'
  | 'possession-change'
  | 'advance'
  | 'penalty-shootout';

/** Zonas do gol na cobrança de pênalti: canto/meio (L, C, R) x alto/baixo (H, L). */
export type PenaltyZone = 'LH' | 'LL' | 'CH' | 'CL' | 'RH' | 'RL';
/** Lado do mergulho do goleiro (visto de frente para o gol, igual às zonas). */
export type Dive = 'L' | 'C' | 'R';
export type PenaltyOutcome = 'goal' | 'save' | 'miss' | 'post';

export interface PenaltyInfo {
  zone: PenaltyZone;
  dive: Dive;
  outcome: PenaltyOutcome;
}

export interface MatchEvent {
  minute: number;
  type: EventType;
  /** 0 = mandante/time A, 1 = visitante/time B. */
  team: 0 | 1;
  zone: Zone;
  playerId?: string;
  secondaryPlayerId?: string;
  shotType?: ShotType;
  xg?: number;
  /** Relógio contínuo da partida em minutos (para animar o fluxo da bola). */
  t?: number;
  /** Cobrança de pênalti (disputa): convertida ou não. */
  scored?: boolean;
  /** Pênalti (no jogo ou na disputa): canto escolhido, lado do mergulho e resultado. */
  penalty?: PenaltyInfo;
  text: string;
}

export interface TeamMatchStats {
  possession: number; // 0..100
  shots: number;
  shotsOnTarget: number;
  xg: number;
  fouls: number;
  yellows: number;
  reds: number;
  offsides: number;
}

export interface MatchReport {
  seed: number;
  teams: [string, string]; // nationIds
  score: [number, number];
  /** Pênaltis (só no mata-mata empatado). */
  shootout?: [number, number];
  /** Ids dos titulares iniciais de cada time, na ordem dos slots. */
  starters: [string[], string[]];
  /** true se houve prorrogação (91'-120'). */
  extraTime: boolean;
  events: MatchEvent[];
  stats: [TeamMatchStats, TeamMatchStats];
  /** playerId -> nota 0..10. */
  ratings: Record<string, number>;
  /** playerId -> condição final. */
  finalCondition: Record<string, number>;
  minutes: number;
}

/** Persistência: interface estável; hoje IndexedDB, depois SQLite WASM. */
export interface SaveSlotInfo {
  id: string;
  label: string;
  updatedAt: number;
}

export interface SaveRepository {
  list(): Promise<SaveSlotInfo[]>;
  load(id: string): Promise<unknown | undefined>;
  save(id: string, label: string, data: unknown): Promise<void>;
  remove(id: string): Promise<void>;
  exportJson(id: string): Promise<string>;
  importJson(json: string): Promise<string>;
}
