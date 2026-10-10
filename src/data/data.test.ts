import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMATION_SLOTS } from '../engine/formations';
import { overall } from '../engine/player';
import type { World } from '../engine/types';
import { COUNTRY_BY_NAME } from './countries';
import { parseCsv } from './csv';
import { computeElo, toRawMatches } from './elo';
import { SQUAD_SIZE, generateSquad } from './squad';
import { buildWorld, buildWorldAndSummaries } from './world';
import { squadOf } from './squads';

const csv = readFileSync(resolve(__dirname, '../../data/raw/results.csv'), 'utf8');
const committed = JSON.parse(readFileSync(resolve(__dirname, '../../data/world.json'), 'utf8')) as World;
const summaries = JSON.parse(readFileSync(resolve(__dirname, '../../data/summaries.json'), 'utf8')) as Record<string, string>;

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
    const built = buildWorldAndSummaries(csv);
    expect(JSON.parse(JSON.stringify(built.world))).toEqual(committed);
    expect(built.summaries).toEqual(summaries);
  });

  it('tem pelo menos 200 seleções-era (décadas de 1930 a 2020 e gerações), sem elencos dentro', () => {
    expect(committed.nations.length).toBeGreaterThanOrEqual(200);
    expect(new Set(committed.nations.map((n) => n.id)).size).toBe(committed.nations.length);
    const decadeEras = committed.nations.filter((n) => n.kind === 'decade');
    const peaks = committed.nations.filter((n) => n.kind === 'peak');
    expect(decadeEras.length).toBeGreaterThanOrEqual(150);
    expect(peaks.length).toBeGreaterThanOrEqual(100);
    const decades = new Set(committed.nations.map((n) => n.decade));
    expect([...decades].sort()).toEqual([1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);
    for (const d of decades) expect(decadeEras.filter((n) => n.decade === d).length).toBeGreaterThanOrEqual(32);
    for (const n of decadeEras) expect(n.matches).toBeGreaterThanOrEqual(15);
    for (const n of committed.nations) {
      expect(n.elo).toBeGreaterThan(1100);
      expect(n.continent).toBeTruthy();
      expect(n.playStyle).toBeTruthy();
      expect(n.percentile).toBeGreaterThanOrEqual(0);
      expect(n.percentile).toBeLessThanOrEqual(100);
      expect(summaries[n.id]!.length).toBeGreaterThan(40);
      expect('squad' in n).toBe(false);
      expect('summary' in n).toBe(false); // os resumos ficam em summaries.json (carregados sob demanda)
    }
    expect(new Set(committed.nations.map((n) => n.continent)).size).toBe(6);
    expect(readFileSync(resolve(__dirname, '../../data/world.json')).length).toBeLessThan(350 * 1024); // sem os resumos
  });

  it('as gerações têm de 4 a 8 anos, id com o período, jogos suficientes e não se sobrepõem na mesma seleção', () => {
    const peaks = committed.nations.filter((n) => n.kind === 'peak');
    for (const p of peaks) {
      const years = p.span[1] - p.span[0] + 1;
      expect(years).toBeGreaterThanOrEqual(4);
      expect(years).toBeLessThanOrEqual(8);
      expect(p.id).toBe(`${p.code}-${p.span[0]}-${p.span[1]}`);
      expect(p.matches).toBeGreaterThanOrEqual(10);
    }
    for (const code of new Set(peaks.map((p) => p.code))) {
      const list = peaks.filter((p) => p.code === code).sort((a, b) => a.span[0] - b.span[0]);
      for (let i = 1; i < list.length; i++) expect(list[i]!.span[0]).toBeGreaterThan(list[i - 1]!.span[1]);
    }
    // a Hungria do início dos anos 50 aparece como geração
    expect(peaks.some((p) => p.code === 'HUN' && p.span[0] <= 1957 && p.span[1] >= 1950)).toBe(true);
  });

  it('a força na época é um percentil coerente com o Elo dentro da década', () => {
    for (const d of [1950, 1990, 2020]) {
      const list = committed.nations.filter((n) => n.kind === 'decade' && n.decade === d).sort((a, b) => a.elo - b.elo);
      for (let i = 1; i < list.length; i++) expect(list[i]!.percentile).toBeGreaterThanOrEqual(list[i - 1]!.percentile);
      expect(list[list.length - 1]!.percentile).toBe(100);
    }
  });

  it('o resumo é factual: o placar da campanha bate com os resultados e não cita jogadores', () => {
    for (const n of committed.nations) {
      expect(n.record.w + n.record.d + n.record.l).toBe(n.matches);
      expect(summaries[n.id]).toContain(`${n.matches} jogos, ${n.record.w} vitórias, ${n.record.d} empates e ${n.record.l} derrotas`);
      expect(summaries[n.id]).toContain(`${n.record.gf} gols marcados e ${n.record.ga} sofridos`);
    }
    const bra70 = committed.nations.find((n) => n.id === 'BRA-1970')!;
    expect(summaries[bra70.id]).toContain('Copa de 1970: 6 jogos (6V 0E 0D)');
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

describe('gerações das melhores seleções do mundo', () => {
  const peaks = committed.nations.filter((n) => n.kind === 'peak');
  /** Anos da janela cobertos pelas gerações da seleção (elas não se sobrepõem). Uma geração tem no mínimo 4 anos, então um buraco de 1 ano entre duas não cabe outra. */
  const yearsCovered = (code: string, from: number, to: number) => peaks.filter((p) => p.code === code).reduce((s, p) => s + Math.max(0, Math.min(p.span[1], to) - Math.max(p.span[0], from) + 1), 0);
  /** A janela fica coberta quando pelo menos 3 dos 5 anos pertencem a gerações da seleção. */
  const covers = (code: string, from: number, to: number) => yearsCovered(code, from, to) >= 3;

  it('toda seleção entre as 3 mais fortes do mundo em uma janela de 5 anos (1930 a 2024) tem uma geração que a cobre', () => {
    const { log } = computeElo(toRawMatches(parseCsv(csv)));
    const ym = new Map<number, { s: number; n: number }>();
    for (const e of log) {
      const v = ym.get(e.year) ?? { s: 0, n: 0 };
      v.s += e.own;
      v.n++;
      ym.set(e.year, v);
    }
    const missing: string[] = [];
    for (let from = 1930; from <= 2020; from += 5) {
      const agg = new Map<string, { n: number; rel: number }>();
      for (const e of log) {
        if (e.year < from || e.year > from + 4 || !COUNTRY_BY_NAME.has(e.team)) continue;
        const a = agg.get(e.team) ?? { n: 0, rel: 0 };
        a.n++;
        a.rel += e.own - ym.get(e.year)!.s / ym.get(e.year)!.n;
        agg.set(e.team, a);
      }
      const top3 = [...agg].filter(([, a]) => a.n >= 10).sort((a, b) => b[1].rel / b[1].n - a[1].rel / a[1].n).slice(0, 3);
      for (const [team] of top3) if (!covers(COUNTRY_BY_NAME.get(team)!.code, from, from + 4)) missing.push(`${team} ${from}-${from + 4}`);
    }
    expect(missing, 'seleções entre as 3 melhores da janela, sem geração').toEqual([]);
  });

  it('inclui as grandes seleções que a regra antiga deixava de fora (Brasil 1960 e 1970, Itália 1938, Inglaterra 1966)', () => {
    for (const [code, from, to] of [['BRA', 1960, 1964], ['BRA', 1970, 1974], ['BRA', 1980, 1984], ['ITA', 1935, 1939], ['ENG', 1965, 1969], ['GER', 1990, 1994], ['ARG', 1950, 1954]] as const) {
      expect(covers(code, from, to), `${code} ${from}-${to}`).toBe(true);
    }
  });

  it('o resumo de uma geração dominante não diz que ela ficou acima da média da própria seleção', () => {
    const bra70 = peaks.find((p) => p.code === 'BRA' && p.span[0] <= 1974 && p.span[1] >= 1970)!;
    expect(bra70, 'geração do Brasil de 1970').toBeTruthy();
    expect(summaries[bra70.id]).toMatch(/mais fortes do mundo/);
    expect(summaries[bra70.id]).not.toContain('acima da média histórica');
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

  it('cada elenco tem um craque fictício com traço especial, o melhor jogador do elenco', () => {
    for (const n of committed.nations) {
      const squad = squadOf(n);
      const stars = squad.filter((p) => p.star);
      expect(stars).toHaveLength(1);
      expect(stars[0]!.trait).toBeTruthy();
      const best = Math.max(...squad.map((p) => overall(p)));
      expect(overall(stars[0]!)).toBe(best);
    }
    expect(new Set(committed.nations.map((n) => squadOf(n).find((p) => p.star)!.trait)).size).toBeGreaterThan(5);
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
