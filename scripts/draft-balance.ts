import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { finalizeDraft, greedyDraft, type DraftConfig } from '../src/data/draft';
import { autoLineup, tacticsForStyle } from '../src/engine/lineup';
import { simulateMatch } from '../src/engine/match';
import {
  buildSetup,
  createTournament,
  fixtureSeed,
  playRemaining,
  playRound,
  userFixture,
  withCustom,
  type Tournament,
} from '../src/engine/tournament';
import type { Formation, NationEra, World } from '../src/engine/types';

/**
 * Balanceamento do draft: simula N drafts com o robô guloso (sempre escolhe o melhor disponível, trocando o sorteio só quando a
 * melhor opção é fraca) e depois uma Copa (todas as eras) com cada time. Alvo: o robô guloso é campeão em menos de 40% das Copas.
 * Uso: npm run draft-balance [-- 1000]
 */
const world = JSON.parse(readFileSync(resolve(import.meta.dirname, '../data/world.json'), 'utf8')) as World;
const N = Number(process.argv[2] ?? 1000);
const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '3-5-2', '5-4-1'];

/** Joga a Copa com o time do draft controlado pela IA (mesma que joga as outras seleções). */
function playCup(team: NationEra, seed: number): Tournament {
  const w = withCustom(world, team);
  const squad = team.customSquad!;
  const lineup = autoLineup(team.id, squad, tacticsForStyle(team.playStyle));
  let t = createTournament(world, team.id, squad.map((p) => p.id), lineup, seed, { cut: 'all', custom: team });
  while (t.stage !== 'DONE') {
    const mine = userFixture(t, w);
    if (!mine) return playRemaining(w, t);
    const report = simulateMatch([buildSetup(w, t, mine.home, false), buildSetup(w, t, mine.away, false)], {
      seed: fixtureSeed(t, mine),
      knockout: !t.stage.startsWith('G'),
      detail: 'summary',
    });
    t = playRound(w, t, report).tournament;
  }
  return t;
}

function depth(t: Tournament, id: string): string {
  const stages = t.results.filter((r) => r.teams.includes(id)).map((r) => r.stage);
  const last = stages[stages.length - 1] ?? 'G1';
  if (t.champion === id) return 'campeão';
  return last === 'F' ? 'final' : last === 'SF' ? 'semifinal' : last === 'QF' ? 'quartas' : last === 'R16' ? 'oitavas' : 'grupos';
}

const t0 = performance.now();
const counts = new Map<string, number>();
let eloSum = 0;
let oppSum = 0;
for (let i = 0; i < N; i++) {
  const config: DraftConfig = { seed: 100000 + i, name: `Robô ${i}`, colors: ['#2244aa', '#ffffff'], formation: FORMATIONS[i % 4] as Formation, memory: false };
  const team = finalizeDraft(greedyDraft(world, config));
  const cup = playCup(team, 7000 + i * 13);
  const d = depth(cup, team.id);
  counts.set(d, (counts.get(d) ?? 0) + 1);
  eloSum += team.elo;
  oppSum += cup.participants.filter((id) => id !== team.id).reduce((s, id) => s + (world.nations.find((n) => n.id === id)?.elo ?? 0), 0) / 31;
}
const pct = (k: string) => (((counts.get(k) ?? 0) / N) * 100).toFixed(1) + '%';
console.log(`\nBalanceamento do draft: ${N} drafts do robô guloso, cada um jogando uma Copa com todas as eras (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
console.table({
  campeão: pct('campeão'),
  'vice (perdeu a final)': pct('final'),
  semifinal: pct('semifinal'),
  quartas: pct('quartas'),
  oitavas: pct('oitavas'),
  'caiu nos grupos': pct('grupos'),
});
console.log(`Elo médio do time do robô: ${(eloSum / N).toFixed(0)} · Elo médio dos adversários sorteados: ${(oppSum / N).toFixed(0)}`);
const champion = (counts.get('campeão') ?? 0) / N;
console.log(`Alvo: robô guloso campeão em menos de 40% das Copas -> ${champion < 0.4 ? 'OK' : 'FORA DO ALVO'} (${(champion * 100).toFixed(1)}%)`);
if (champion >= 0.4) process.exitCode = 1;
