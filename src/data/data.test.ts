import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMATION_SLOTS } from '../engine/formations';
import { overall } from '../engine/player';
import type { World } from '../engine/types';
import { parseCsv } from './csv';
import { computeElo, toRawMatches } from './elo';
import { SQUAD_SIZE, generateSquad } from './squad';
import { buildWorld } from './world';
import { squadOf } from './squads';

const csv = readFileSync(resolve(__dirname, '../../data/raw/results.csv'), 'utf8');
const committed = JSON.parse(readFileSync(resolve(__dirname, '../../data/world.json'), 'utf8')) as World;

describe('csv', () => {
  it('lê campos entre aspas com vírgula', () => {
    const rows = parseCsv('a,b,c\n1,"Washington, D.C.",3\n');
    expect(rows).toEqual([{ a: '1', b: 'Washington, D.C.', c: '3' }]);
  });
});

describe('elo', () => {
  it('é soma zero e premia o vencedor', () => {
    const rows = parseCsv('date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n1960-01-01,A,B,2,0,Friendly,x,y,TRUE\n');
    const { finalRatings } = computeElo(toRawMatches(rows));
    expect(finalRatings.get('A')).toBeGreaterThan(1500);
    expect((finalRatings.get('A') as number) + (finalRatings.get('B') as number)).toBeCloseTo(3000, 6);
  });

  it('ignora jogos sem placar (NA)', () => {
    const rows = parseCsv('date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n1960-01-01,A,B,NA,NA,Friendly,x,y,TRUE\n');
    expect(toRawMatches(rows)).toHaveLength(0);
  });
});

describe('world.json', () => {
  it('é reproduzido exatamente pelo build-world', () => {
    expect(JSON.parse(JSON.stringify(buildWorld(csv)))).toEqual(committed);
  });

  it('tem todas as seleções-era com jogos suficientes (pelo menos 150), de 1930 a 2020, sem elencos dentro', () => {
    expect(committed.nations.length).toBeGreaterThanOrEqual(150);
    expect(new Set(committed.nations.map((n) => n.id)).size).toBe(committed.nations.length);
    const decades = new Set(committed.nations.map((n) => n.decade));
    expect([...decades].sort()).toEqual([1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);
    for (const d of decades) expect(committed.nations.filter((n) => n.decade === d).length).toBeGreaterThanOrEqual(32);
    for (const n of committed.nations) {
      expect(n.matches).toBeGreaterThanOrEqual(15);
      expect(n.elo).toBeGreaterThan(1100);
      expect(n.continent).toBeTruthy();
      expect(n.playStyle).toBeTruthy();
      expect('squad' in n).toBe(false);
    }
    expect(new Set(committed.nations.map((n) => n.continent)).size).toBe(6);
    expect(readFileSync(resolve(__dirname, '../../data/world.json')).length).toBeLessThan(300 * 1024);
  });

  it('o critério de mínimo de jogos é ajustável: mais exigente gera menos seleções-era', () => {
    expect(buildWorld(csv, 30).nations.length).toBeLessThan(committed.nations.length);
    expect(buildWorld(csv, 5).nations.length).toBeGreaterThan(committed.nations.length);
  });

  it('traz média de gols por década', () => {
    expect(committed.decades.map((d) => d.decade)).toEqual([1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);
    for (const d of committed.decades) expect(d.goalsPerMatchCompetitive).toBeGreaterThan(1.5);
  });
});

describe('elencos', () => {
  it('são gerados sob demanda e sempre iguais (seed fixa por seleção-era)', () => {
    for (const n of [committed.nations[0]!, committed.nations[200]!, committed.nations[500]!]) {
      const fresh = generateSquad({ nationId: n.id, culture: n.culture as never, decade: n.decade, elo: n.elo, playStyle: n.playStyle });
      expect(squadOf(n)).toEqual(fresh);
      expect(squadOf(n)).toBe(squadOf(n));
    }
  });

  it('têm 40 jogadores, ids únicos, atributos válidos e cobrem todas as formações', () => {
    for (const n of committed.nations) {
      const squad = squadOf(n);
      expect(squad).toHaveLength(SQUAD_SIZE);
      expect(new Set(squad.map((p) => p.id)).size).toBe(SQUAD_SIZE);
      expect(new Set(squad.map((p) => p.name)).size).toBe(SQUAD_SIZE);
      for (const p of squad) {
        for (const v of Object.values(p.attrs)) {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(99);
        }
        expect(p.age).toBeGreaterThanOrEqual(18);
        expect(p.age).toBeLessThanOrEqual(37);
        expect(p.condition).toBeGreaterThanOrEqual(90);
      }
      for (const slots of Object.values(FORMATION_SLOTS)) {
        const need = new Map<string, number>();
        for (const s of slots) need.set(s, (need.get(s) ?? 0) + 1);
        for (const [slot, k] of need) expect(squad.filter((p) => p.slot === slot).length).toBeGreaterThanOrEqual(k);
      }
    }
  });

  it('a força do elenco acompanha o Elo da seleção-era', () => {
    const xs = committed.nations.map((n) => n.elo);
    const ys = committed.nations.map((n) => {
      const top = squadOf(n).map(overall).sort((a, b) => b - a).slice(0, 11);
      return top.reduce((a, b) => a + b, 0) / 11;
    });
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i]! - my);
      sxx += (x - mx) ** 2;
      syy += (ys[i]! - my) ** 2;
    });
    expect(sxy / Math.sqrt(sxx * syy)).toBeGreaterThan(0.9);
  });

  it('não usa nomes de jogadores reais conhecidos', () => {
    const blocked = ['pelé', 'pele', 'maradona', 'messi', 'zidane', 'cruyff', 'beckenbauer', 'ronaldo', 'ronaldinho', 'neymar', 'garrincha', 'platini', 'maldini', 'baggio', 'eusébio', 'puskás', 'yashin', 'charlton', 'zico', 'romário', 'kaká', 'xavi', 'iniesta', 'mbappé', 'haaland', 'modrić', 'ibrahimović', 'figo', 'rivaldo', 'sócrates', 'falcão', 'cafu', 'bebeto', 'klinsmann', 'matthäus', 'rummenigge', 'müller', 'lineker', 'bergkamp', 'kopa', 'fontaine', 'stoichkov', 'hagi', 'lev yashin'];
    for (const n of committed.nations) {
      for (const p of squadOf(n)) {
        const lower = p.name.toLowerCase();
        for (const b of blocked) expect(lower.split(' ').includes(b), `${p.name} contém ${b}`).toBe(false);
      }
    }
  });
});
