import { Rng, hashSeed } from '../engine/prng';
import { overall } from '../engine/player';
import type { Attributes, Decade, Player, PlayStyle, Position, Slot } from '../engine/types';
import type { Culture } from './countries';
import { generateUniqueNames } from './names';

export const SQUAD_SIZE = 40;

/** Composição do pool de 40: slot -> quantidade. */
const COMPOSITION: [Slot, number][] = [
  ['GK', 4],
  ['CB', 6],
  ['LB', 3],
  ['RB', 3],
  ['WB', 2],
  ['DM', 4],
  ['CM', 5],
  ['AM', 4],
  ['LW', 2],
  ['RW', 2],
  ['ST', 5],
];

const SLOT_POSITION: Record<Slot, Position> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', WB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

type Bias = Partial<Attributes>;

interface StyleDef {
  name: string;
  slots: Slot[];
  from?: Decade;
  to?: Decade;
  bias: Bias;
  weight?: number;
}

/** Estilos por slot e era (a partir/até a década indicada, inclusive). */
const STYLES: StyleDef[] = [
  { name: 'goleiro clássico', slots: ['GK'], bias: { goleiro: 2, fisico: 3 } },
  { name: 'goleiro de reflexos', slots: ['GK'], bias: { goleiro: 4, velocidade: 6, fisico: -4 } },
  { name: 'goleiro líbero', slots: ['GK'], from: 1990, bias: { passe: 18, drible: 8, goleiro: -2 } },
  { name: 'líbero clássico', slots: ['CB'], to: 1980, bias: { defesa: 3, passe: 8, drible: 4, fisico: -3 } },
  { name: 'zagueiro xerife', slots: ['CB'], bias: { defesa: 6, fisico: 8, velocidade: -8, passe: -6 } },
  { name: 'zagueiro construtor', slots: ['CB'], from: 1990, bias: { passe: 12, drible: 4, fisico: -2 } },
  { name: 'zagueiro veloz', slots: ['CB'], from: 1970, bias: { velocidade: 10, defesa: 1, fisico: -3 } },
  { name: 'lateral defensivo', slots: ['LB', 'RB'], bias: { defesa: 7, fisico: 3, drible: -6, velocidade: -2 } },
  { name: 'lateral apoiador', slots: ['LB', 'RB'], bias: { velocidade: 8, passe: 5, drible: 4, defesa: -4 } },
  { name: 'ala ofensivo', slots: ['WB'], from: 1970, bias: { velocidade: 10, drible: 6, passe: 4, defesa: -6 } },
  { name: 'ala incansável', slots: ['WB'], bias: { fisico: 10, velocidade: 6, defesa: 2 } },
  { name: 'volante marcador', slots: ['DM'], bias: { defesa: 8, fisico: 8, passe: -4, drible: -8 } },
  { name: 'regista', slots: ['DM'], from: 1990, bias: { passe: 12, defesa: 2, drible: 2, fisico: -4 } },
  { name: 'médio-volante cerebral', slots: ['DM'], to: 1980, bias: { passe: 8, defesa: 4, velocidade: -6 } },
  { name: 'meia box-to-box', slots: ['CM'], bias: { fisico: 8, defesa: 3, passe: 2, finalizacao: 2 } },
  { name: 'meia armador', slots: ['CM'], bias: { passe: 10, drible: 3, fisico: -4 } },
  { name: 'meia de ligação', slots: ['CM'], bias: { passe: 5, drible: 5, defesa: 1 } },
  { name: 'camisa 10 cerebral', slots: ['AM'], bias: { passe: 12, drible: 8, finalizacao: 2, fisico: -8, defesa: -8 } },
  { name: 'meia driblador', slots: ['AM'], bias: { drible: 12, velocidade: 4, passe: 3, fisico: -6 } },
  { name: 'meia atacante', slots: ['AM'], from: 1980, bias: { finalizacao: 8, passe: 5, drible: 4, defesa: -8 } },
  { name: 'ponta driblador', slots: ['LW', 'RW'], bias: { drible: 12, velocidade: 8, finalizacao: -4, fisico: -6 } },
  { name: 'ponta de velocidade', slots: ['LW', 'RW'], bias: { velocidade: 14, drible: 4, passe: -4 } },
  { name: 'ponta que flutua', slots: ['LW', 'RW'], from: 2000, bias: { finalizacao: 8, drible: 6, passe: 2 } },
  { name: 'centroavante fixo', slots: ['ST'], bias: { finalizacao: 6, fisico: 10, velocidade: -8, drible: -4 } },
  { name: 'artilheiro de área', slots: ['ST'], bias: { finalizacao: 12, fisico: 2, velocidade: -2, passe: -6 } },
  { name: 'atacante veloz', slots: ['ST'], bias: { velocidade: 14, finalizacao: 3, fisico: -4 } },
  { name: 'segundo atacante', slots: ['ST'], bias: { drible: 8, passe: 6, finalizacao: 2, fisico: -6 } },
  { name: 'falso 9', slots: ['ST'], from: 2010, bias: { passe: 10, drible: 8, finalizacao: -2, fisico: -8 } },
];

/** Perfil base de atributos relativo à nota geral, por posição. */
const POSITION_BASE: Record<Position, Attributes> = {
  GK: { defesa: -35, passe: -18, drible: -40, finalizacao: -50, fisico: -8, velocidade: -28, goleiro: 6 },
  DEF: { defesa: 8, passe: -4, drible: -14, finalizacao: -28, fisico: 2, velocidade: -4, goleiro: -70 },
  MID: { defesa: -6, passe: 7, drible: 0, finalizacao: -8, fisico: 0, velocidade: -3, goleiro: -70 },
  FWD: { defesa: -34, passe: -4, drible: 5, finalizacao: 10, fisico: -4, velocidade: 4, goleiro: -70 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Traço especial do craque por posição: o que ele faz de diferente e quanto reforça seus atributos. */
const STAR_TRAITS: Record<Slot, { trait: string; boost: Partial<Attributes> }[]> = {
  GK: [{ trait: 'goleiro paredão', boost: { goleiro: 10, fisico: 4 } }],
  CB: [{ trait: 'muralha', boost: { defesa: 10, fisico: 7 } }, { trait: 'zagueiro-líder', boost: { defesa: 8, passe: 7, fisico: 4 } }],
  LB: [{ trait: 'lateral incansável', boost: { velocidade: 9, fisico: 8, passe: 3 } }],
  RB: [{ trait: 'lateral incansável', boost: { velocidade: 9, fisico: 8, passe: 3 } }],
  WB: [{ trait: 'lateral incansável', boost: { velocidade: 9, fisico: 8, passe: 3 } }],
  DM: [{ trait: 'volante de ferro', boost: { defesa: 9, fisico: 8 } }],
  CM: [{ trait: 'armador cerebral', boost: { passe: 11, drible: 4 } }],
  AM: [{ trait: 'camisa 10 genial', boost: { passe: 9, drible: 9, finalizacao: 4 } }],
  LW: [{ trait: 'driblador decisivo', boost: { drible: 11, finalizacao: 5, velocidade: 4 } }, { trait: 'ponta-foguete', boost: { velocidade: 12, drible: 5 } }],
  RW: [{ trait: 'driblador decisivo', boost: { drible: 11, finalizacao: 5, velocidade: 4 } }, { trait: 'ponta-foguete', boost: { velocidade: 12, drible: 5 } }],
  ST: [{ trait: 'artilheiro de área', boost: { finalizacao: 11, fisico: 4 } }, { trait: 'centroavante completo', boost: { finalizacao: 8, passe: 6, drible: 5 } }],
};

/** O melhor jogador do elenco vira o craque: ganha um traço especial (e o reforço de atributos que o acompanha). */
function markStar(players: Player[], rng: Rng): void {
  let best: Player | undefined;
  let bestV = -Infinity;
  for (const p of players) {
    const v = overall(p);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  if (!best) return;
  const option = rng.pick(STAR_TRAITS[best.slot]);
  for (const key of Object.keys(option.boost) as (keyof Attributes)[]) best.attrs[key] = Math.min(99, best.attrs[key] + (option.boost[key] as number));
  best.star = true;
  best.trait = option.trait;
}

export interface SquadInput {
  nationId: string;
  culture: Culture;
  decade: Decade;
  /** Elo médio da era; define o nível dos jogadores. */
  elo: number;
  playStyle: PlayStyle;
}

/** Nível médio do elenco a partir do Elo (Elo 1500 -> 50; 2100 -> 77). */
export function teamQuality(elo: number): number {
  return clamp(50 + (elo - 1500) * 0.045, 35, 90);
}

function pickStyle(slot: Slot, decade: Decade, rng: Rng): StyleDef {
  const options = STYLES.filter((s) => s.slots.includes(slot) && (s.from ?? 1930) <= decade && (s.to ?? 2020) >= decade);
  return rng.weighted(options, options.map((o) => o.weight ?? 1));
}

/** Gera o elenco de ~40 jogadores. Determinístico: depende só dos campos de SquadInput. */
export function generateSquad(input: SquadInput): Player[] {
  const rng = new Rng(hashSeed(`squad:${input.nationId}`));
  const names = generateUniqueNames(input.culture, rng.fork('names'), SQUAD_SIZE);
  const quality = teamQuality(input.elo);

  // 1) nota bruta por jogador, ordenada por grupo de posição para aplicar queda de profundidade.
  interface Draft { slot: Slot; position: Position; raw: number }
  const drafts: Draft[] = [];
  for (const [slot, count] of COMPOSITION) {
    for (let i = 0; i < count; i++) drafts.push({ slot, position: SLOT_POSITION[slot], raw: quality + rng.normal(0, 5) });
  }
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const group = drafts.filter((d) => d.position === position).sort((a, b) => b.raw - a.raw);
    group.forEach((d, rank) => {
      d.raw = d.raw + 3 - (rank / group.length) * 12;
    });
    // alguns craques por seleção forte: bônus ao melhor de DEF/MID/FWD.
    if (position !== 'GK' && group[0]) group[0].raw += clamp((quality - 55) * 0.35, 0, 8);
  }

  // 2) atributos a partir da nota, posição e estilo.
  const players: Player[] = drafts.map((d, i) => {
    const style = pickStyle(d.slot, input.decade, rng);
    const base = POSITION_BASE[d.position];
    const attrs = {} as Attributes;
    for (const key of Object.keys(base) as (keyof Attributes)[]) {
      const noise = key === 'goleiro' && d.position !== 'GK' ? rng.range(0, 8) : rng.normal(0, 4);
      let v = d.raw + base[key] + (style.bias[key] ?? 0) + noise;
      if (key === 'goleiro' && d.position !== 'GK') v = 5 + noise + 5;
      attrs[key] = Math.round(clamp(v, 1, 99));
    }
    const ageMean = d.position === 'GK' ? 29 : 26.5;
    return {
      id: `${input.nationId}-${String(i + 1).padStart(2, '0')}`,
      name: names[i] as string,
      nationality: input.nationId.split('-')[0] as string,
      position: d.position,
      slot: d.slot,
      age: Math.round(clamp(rng.normal(ageMean, 3.6), 18, 37)),
      style: style.name,
      attrs,
      condition: rng.int(90, 100),
    };
  });

  markStar(players, rng.fork('star'));
  const order: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  players.sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || overall(b) - overall(a));
  // reatribui ids na ordem final para que sejam estáveis e legíveis.
  return players.map((p, i) => ({ ...p, id: `${input.nationId}-${String(i + 1).padStart(2, '0')}` }));
}
