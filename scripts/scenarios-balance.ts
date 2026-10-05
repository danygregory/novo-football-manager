/** Quanto é difícil cada cenário? Taxa de vitória com escalação automática em 400 seeds, e o resultado da seed fixa. Uso: npm run scenarios-balance */
import { readFileSync } from 'node:fs';
import { autoLineup, autoSquad23, buildSetup, createScenario, fixtureSeed, nationOf, SCENARIOS, scenarioResult, simulateMatch, tacticsForStyle, userFixture, winnerOf, type MatchResult, type World } from '../src/engine';
import { squadOf } from '../src/data/squads';

const world = JSON.parse(readFileSync('data/world.json', 'utf8')) as World;
const N = 400;
if (process.argv.includes('--salts')) {
  // procura, para cada cenário, o menor salt em que a escalação automática perde por 1 ou 2 gols (sem pênaltis)
  for (const sc of SCENARIOS) {
    const nation = nationOf(world, sc.user);
    const squad = autoSquad23(squadOf(nation));
    for (let salt = 0; salt < 400; salt++) {
      const t = createScenario(world, { ...sc, salt }, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
      const f = userFixture(t, world)!;
      const r = simulateMatch([buildSetup(world, t, f.home, true), buildSetup(world, t, f.away, false)], { seed: fixtureSeed(t, f), knockout: true, detail: 'summary' });
      const mine = f.home === sc.user ? 0 : 1;
      const [a, b] = [r.score[mine]!, r.score[1 - mine]!];
      if (b > a && b - a <= 2 && !r.shootout && !r.extraTime) {
        console.log(`${sc.id}: salt ${salt} (${a}-${b})`);
        break;
      }
    }
  }
  process.exit(0);
}
console.log('cenário'.padEnd(24), 'Elo você/adv'.padEnd(14), 'vitórias (400 seeds)', ' seed fixa');
for (const sc of SCENARIOS) {
  const nation = nationOf(world, sc.user);
  const squad = autoSquad23(squadOf(nation));
  const t = createScenario(world, sc, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
  const f = userFixture(t, world)!;
  const run = (seed: number) => simulateMatch([buildSetup(world, t, f.home, true), buildSetup(world, t, f.away, false)], { seed, knockout: true, detail: 'summary' });
  let wins = 0;
  for (let s = 0; s < N; s++) {
    const r = run(s * 7919 + 13);
    const res: MatchResult = { id: 'SCN', stage: 'F', teams: [f.home, f.away], score: r.score, shootout: r.shootout, extraTime: r.extraTime, goals: [] };
    if (winnerOf(res) === sc.user) wins++;
  }
  const r = run(fixtureSeed(t, f));
  const res = scenarioResult(world, { ...t, results: [{ id: 'SCN', stage: 'F', teams: [f.home, f.away], score: r.score, shootout: r.shootout, extraTime: r.extraTime, goals: [] }] });
  console.log(sc.id.padEnd(24), `${Math.round(nation.elo)}/${Math.round(nationOf(world, sc.opponent).elo)}`.padEnd(14), `${((100 * wins) / N).toFixed(0)}%`.padEnd(20), res?.text, `${res?.score.join('-')}`, `${res?.points} pts`);
}
