import world from '../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle, MatchSimulator, type NationEra, type Tactics, type TeamSetup } from '../src/engine';
const nations = world.nations as unknown as NationEra[];
const setup = (id: string, ai: boolean): TeamSetup => { const n = nations.find((x) => x.id === id)!; const squad = autoSquad23(n.squad); return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai }; };
const A: Tactics = { formation: '4-3-3', pressing: 1, lineHeight: 0.95, tempo: 0.95 };
const P: Tactics = { formation: '5-4-1', pressing: 0.05, lineHeight: 0.05, tempo: 0.05 };
const rows: Record<string, unknown>[] = [];
for (const [name, t] of [['base', undefined], ['ataque total', A], ['retranca total', P]] as const) {
  let sf = 0, sa = 0, gf = 0, ga = 0, off = 0; const N = 600;
  for (let seed = 0; seed < N; seed++) {
    const sim = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed, detail: 'summary' });
    sim.playUntil(60); const b = sim.liveState().score; const s0 = sim.report().stats; if (t) sim.setTactics(0, t); const r = sim.playToEnd();
    sf += r.stats[0].shots - s0[0].shots; sa += r.stats[1].shots - s0[1].shots; gf += r.score[0] - b[0]; ga += r.score[1] - b[1]; off += r.stats[0].offsides - s0[0].offsides;
  }
  rows.push({ tática: name, 'chutes pró 60-90': +(sf / N).toFixed(2), 'chutes contra': +(sa / N).toFixed(2), 'gols pró': +(gf / N).toFixed(2), 'gols contra': +(ga / N).toFixed(2), 'saldo': +((gf - ga) / N).toFixed(2), impedimentos: +(off / N).toFixed(2) });
}
console.table(rows);
