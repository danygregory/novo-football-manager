import { describe, expect, it } from 'vitest';
import { overall } from '../engine/player';
import type { Player } from '../engine/types';
import { NEUTRAL_TOP_SHARE, generateSquad, type SquadInput } from './squad';

const input = (nationId: string, elo: number, decade: SquadInput['decade'], culture: SquadInput['culture'] = 'portugues'): SquadInput => ({ nationId, culture, decade, elo, playStyle: 'equilibrado' });
const CASES: SquadInput[] = [input('BRA-1970', 1972, 1970), input('NOR-2020', 1800, 2020, 'nordico'), input('HAI-1970', 1450, 1970, 'frances'), input('ARG-2020', 2176, 2020, 'espanhol')];

/** Atacantes por nota, do melhor ao pior. */
const forwards = (squad: Player[]) => squad.filter((p) => p.position === 'FWD').sort((a, b) => overall(b) - overall(a));
/** Quanto a finalização do atacante principal passa da média dos 3 seguintes. */
const gap = (squad: Player[]) => {
  const f = forwards(squad);
  return f[0]!.attrs.finalizacao - f.slice(1, 4).reduce((s, p) => s + p.attrs.finalizacao, 0) / 3;
};

describe('perfil de artilheiro no elenco (topShare)', () => {
  it('o valor neutro, ou a falta dele, não muda nada no elenco', () => {
    for (const c of CASES) {
      expect(generateSquad({ ...c, topShare: NEUTRAL_TOP_SHARE })).toEqual(generateSquad(c));
    }
  });

  it('não muda quem é cada jogador: ids, nomes, posições, idades e estilos são os mesmos (só atributos de ataque mudam)', () => {
    for (const c of CASES) {
      const base = generateSquad(c);
      for (const share of [0.1, 0.4]) {
        const other = generateSquad({ ...c, topShare: share });
        expect(other.map((p) => [p.id, p.name, p.position, p.slot, p.age, p.style, p.condition])).toEqual(base.map((p) => [p.id, p.name, p.position, p.slot, p.age, p.style, p.condition]));
        for (let i = 0; i < base.length; i++) {
          if (base[i]!.position !== 'FWD') expect(other[i]!.attrs).toEqual(base[i]!.attrs);
          const { finalizacao: _a, ...rest } = base[i]!.attrs;
          const { finalizacao: _b, ...restOther } = other[i]!.attrs;
          expect(restOther).toEqual(rest); // só a finalização muda
        }
      }
    }
  });

  it('seleção de um craque artilheiro abre distância do atacante principal; gols espalhados a fecham', () => {
    for (const c of CASES) {
      const neutral = gap(generateSquad(c));
      expect(gap(generateSquad({ ...c, topShare: 0.4 })), `${c.nationId} concentrada`).toBeGreaterThan(neutral + 3);
      expect(gap(generateSquad({ ...c, topShare: 0.1 })), `${c.nationId} espalhada`).toBeLessThan(neutral);
    }
  });

  it('o craque continua sendo o melhor jogador do elenco, em qualquer perfil', () => {
    for (const c of CASES) {
      for (const share of [0.08, 0.19, 0.4]) {
        const squad = generateSquad({ ...c, topShare: share });
        const star = squad.find((p) => p.star)!;
        expect(overall(star), `${c.nationId} ${share}`).toBe(Math.max(...squad.map((p) => overall(p))));
        expect(squad.filter((p) => p.star)).toHaveLength(1);
      }
    }
  });

  it('limites: nenhum atributo sai de 1 a 99', () => {
    for (const c of CASES) for (const share of [0.05, 0.6]) for (const p of generateSquad({ ...c, topShare: share })) for (const v of Object.values(p.attrs)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99); }
  });
});
