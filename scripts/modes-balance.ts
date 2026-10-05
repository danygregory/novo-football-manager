import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squadOf } from '../src/data/squads';
import { applyCup, careerCut, newCareer, takeTeam, type Career } from '../src/engine/career';
import { dailyCut, dailySeed, dailyTeam } from '../src/engine/daily';
import { autoLineup, autoSquad23, tacticsForStyle } from '../src/engine/lineup';
import { simulateMatch } from '../src/engine/match';
import { Rng } from '../src/engine/prng';
import { ACHIEVEMENTS, newAchievements, summarizeCup, type AchievementContext } from '../src/engine/scoring';
import { buildSetup, createTournament, fixtureSeed, playRemaining, playRound, userFixture, type Cut, type Tournament } from '../src/engine/tournament';
import type { NationEra, World } from '../src/engine/types';

/**
 * Balanceamento dos modos: um robô (a mesma IA que joga as outras seleções) cumpre carreiras, desafios do dia e Copas comuns.
 * O jogador humano, que pode trocar tática, gritar e substituir, tende a ir um pouco melhor que o robô: leia os números como piso.
 * Uso: npm run modes-balance [-- carreiras desafios copas]
 */
const world = JSON.parse(readFileSync(resolve(import.meta.dirname, '../data/world.json'), 'utf8')) as World;
const [CAREERS, DAYS, COMMON] = [Number(process.argv[2] ?? 150), Number(process.argv[3] ?? 200), Number(process.argv[4] ?? 300)];
const MAX_CUPS = 10;

function playCup(nationId: string, seed: number, cut: Cut): Tournament {
  const n = world.nations.find((x) => x.id === nationId) as NationEra;
  const squad = autoSquad23(squadOf(n));
  let t = createTournament(world, nationId, squad.map((p) => p.id), autoLineup(nationId, squad, tacticsForStyle(n.playStyle)), seed, { cut });
  while (t.stage !== 'DONE') {
    const mine = userFixture(t, world);
    if (!mine) return playRemaining(world, t);
    const report = simulateMatch([buildSetup(world, t, mine.home, false), buildSetup(world, t, mine.away, false)], { seed: fixtureSeed(t, mine), knockout: !t.stage.startsWith('G'), detail: 'summary' });
    t = playRound(world, t, report).tournament;
  }
  return t;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const quant = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)] ?? 0;
const ach = new Map<string, number>(ACHIEVEMENTS.map((a) => [a.id, 0]));
let cupsTotal = 0;
const unlock = (s: ReturnType<typeof summarizeCup>, ctx: AchievementContext) => {
  cupsTotal++;
  for (const a of newAchievements(s, ctx, new Set())) ach.set(a.id, (ach.get(a.id) ?? 0) + 1);
};
const t0 = performance.now();

// ---------- carreira ----------
const repByCup: number[][] = Array.from({ length: MAX_CUPS }, () => []);
const reached80: number[] = [];
const offersDist = [0, 0, 0, 0];
const titles: number[] = [];
const stageByPot = new Map<number, number[]>();
const careerAch = new Set<string>();
for (let c = 0; c < CAREERS; c++) {
  let career: Career = newCareer(world, 5000 + c);
  // robô ambicioso: começa pela mais forte das 3 opções
  const options = (career.startOptions ?? []).map((id) => world.nations.find((n) => n.id === id) as NationEra);
  career = takeTeam(career, options.sort((a, b) => b.elo - a.elo)[0]!.id);
  let reachedAt = 0;
  for (let k = 0; k < MAX_CUPS; k++) {
    const nation = world.nations.find((n) => n.id === career.nationId) as NationEra;
    const t = playCup(nation.id, 900000 + c * 101 + k, careerCut(world, nation));
    const s = summarizeCup(world, t);
    career = applyCup(world, career, t, s.ev, s.total);
    repByCup[k]!.push(career.rep);
    if (!reachedAt && career.rep >= 80) reachedAt = k + 1;
    const arr = stageByPot.get(s.ev.pot) ?? [];
    arr.push(s.ev.stage);
    stageByPot.set(s.ev.pot, arr);
    offersDist[career.offers?.length ?? 0]!++;
    const ctx: AchievementContext = { careerTitles: career.entries.filter((e) => e.champion).length, careerRep: career.rep, previousCups: k };
    for (const a of newAchievements(s, ctx, new Set())) careerAch.add(a.id);
    unlock(s, ctx);
    // aceita o convite mais forte se for claramente melhor que a seleção atual; senão continua
    const better = (career.offers ?? []).map((id) => world.nations.find((n) => n.id === id) as NationEra).sort((a, b) => b.elo - a.elo)[0];
    career = better && better.elo > nation.elo + 40 ? takeTeam(career, better.id) : { ...career, offers: undefined };
  }
  reached80.push(reachedAt);
  titles.push(career.entries.filter((e) => e.champion).length);
}

console.log(`\n== Carreira: ${CAREERS} carreiras de ${MAX_CUPS} Copas (robô ambicioso) ==`);
console.table(
  repByCup.map((xs, k) => ({ 'após a Copa': k + 1, 'reputação média': +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), p10: quant(xs, 0.1), mediana: quant(xs, 0.5), p90: quant(xs, 0.9), '>= 80': pct(xs.filter((v) => v >= 80).length / xs.length) })),
);
const got = reached80.filter((x) => x > 0);
console.log(`Chegaram a 80 de reputação em até ${MAX_CUPS} Copas: ${pct(got.length / CAREERS)}${got.length ? `, em média na Copa ${(got.reduce((a, b) => a + b, 0) / got.length).toFixed(1)}` : ''}`);
console.log(`Títulos por carreira: média ${(titles.reduce((a, b) => a + b, 0) / CAREERS).toFixed(2)}, carreiras com 1+ título: ${pct(titles.filter((x) => x > 0).length / CAREERS)}`);
const totalOffers = offersDist.reduce((a, b) => a + b, 0);
console.log(`Convites por Copa: 0: ${pct(offersDist[0]! / totalOffers)} · 1: ${pct(offersDist[1]! / totalOffers)} · 2: ${pct(offersDist[2]! / totalOffers)} · 3: ${pct(offersDist[3]! / totalOffers)}`);
console.table(
  [1, 2, 3, 4].map((p) => {
    const xs = stageByPot.get(p) ?? [];
    const n = xs.length || 1;
    return { pote: p, Copas: xs.length, grupos: pct(xs.filter((x) => x === 0).length / n), oitavas: pct(xs.filter((x) => x === 1).length / n), quartas: pct(xs.filter((x) => x === 2).length / n), semi: pct(xs.filter((x) => x === 3).length / n), vice: pct(xs.filter((x) => x === 4).length / n), campeão: pct(xs.filter((x) => x === 5).length / n) };
  }),
);

// ---------- desafio do dia ----------
const dailyPts: number[] = [];
const dailyStage = [0, 0, 0, 0, 0, 0];
const dailyAch = new Set<string>();
for (let d = 0; d < DAYS; d++) {
  const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  const team = dailyTeam(world, date);
  const t = playCup(team.id, dailySeed(date), dailyCut(world, team));
  const s = summarizeCup(world, t);
  dailyPts.push(s.total);
  dailyStage[s.ev.stage]!++;
  for (const a of newAchievements(s, { daily: true }, new Set())) dailyAch.add(a.id);
  unlock(s, { daily: true });
}
console.log(`\n== Desafio do dia: ${DAYS} dias (robô) ==`);
console.log(`Pontos: mediana ${quant(dailyPts, 0.5)}, p10 ${quant(dailyPts, 0.1)}, p90 ${quant(dailyPts, 0.9)}`);
console.log(`Etapa: grupos ${pct(dailyStage[0]! / DAYS)} · oitavas ${pct(dailyStage[1]! / DAYS)} · quartas ${pct(dailyStage[2]! / DAYS)} · semi ${pct(dailyStage[3]! / DAYS)} · vice ${pct(dailyStage[4]! / DAYS)} · campeão ${pct(dailyStage[5]! / DAYS)}`);

// ---------- Copas comuns (seleção pronta, todas as eras) ----------
const rng = new Rng(77);
for (let i = 0; i < COMMON; i++) {
  const nation = rng.pick(world.nations);
  const t = playCup(nation.id, 700000 + i, 'all');
  unlock(summarizeCup(world, t), { previousCups: i });
}

console.log(`\n== Conquistas: em quantas das ${cupsTotal} Copas simuladas cada uma é desbloqueada (robô; contexto de carreira e desafio incluídos) ==`);
console.table(
  ACHIEVEMENTS.map((a) => ({ conquista: a.name, '% das Copas': +(((ach.get(a.id) ?? 0) / cupsTotal) * 100).toFixed(2), 'alcançada em carreira': careerAch.has(a.id) ? 'sim' : '-', 'no desafio': dailyAch.has(a.id) ? 'sim' : '-' })),
);
const never = ACHIEVEMENTS.filter((a) => (ach.get(a.id) ?? 0) === 0).map((a) => a.name);
console.log(never.length ? `Nunca desbloqueadas pelo robô: ${never.join(', ')}` : 'Todas as conquistas foram desbloqueadas pelo robô ao menos uma vez.');
console.log(`(${((performance.now() - t0) / 1000).toFixed(0)} s)`);
