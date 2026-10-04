import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { MatchSimulator, replayMatch, type TeamSetup } from './match';
import { buildSetup, createTournament, fixtureSeed, replayRecord, startRecord, userFixture, type Tournament } from './tournament';
import type { Tactics, World } from './types';
import { squadOf } from '../data/squads';

const world = worldJson as unknown as World;
const get = (id: string) => world.nations.find((n) => n.id === id)!;

function setup(id: string, ai: boolean): TeamSetup {
  const n = get(id);
  const squad = autoSquad23(squadOf(n));
  return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai };
}

const ATTACK: Tactics = { formation: '4-3-3', pressing: 1, lineHeight: 0.95, tempo: 0.95 };
const PARK: Tactics = { formation: '5-4-1', pressing: 0.05, lineHeight: 0.05, tempo: 0.05 };

describe('motor passo a passo', () => {
  it('não pré-calcula a partida: o início é idêntico, qualquer que seja o comando futuro', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = (tactics?: Tactics) => {
        const sim = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed });
        sim.playThrough(60);
        const cut = sim.clockExact;
        if (tactics) sim.setTactics(0, tactics);
        sim.playToEnd();
        return { cut, events: sim.eventLog.filter((e) => (e.t ?? 0) <= cut && e.type !== 'tactic') };
      };
      const base = run();
      const changed = run(ATTACK);
      expect(changed.events).toEqual(base.events);
    }
  });

  it('uma mudança de tática no minuto 60 altera o resultado e as estatísticas do restante do jogo', () => {
    let differentScores = 0;
    let attackShots = 0;
    let parkShots = 0;
    const n = 60;
    for (let seed = 0; seed < n; seed++) {
      const run = (tactics: Tactics) => {
        const sim = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed, detail: 'summary' });
        sim.playThrough(60);
        sim.setTactics(0, tactics);
        return sim.playToEnd();
      };
      const a = run(ATTACK);
      const p = run(PARK);
      if (a.score.join() !== p.score.join()) differentScores++;
      attackShots += a.stats[0].shots;
      parkShots += p.stats[0].shots;
    }
    expect(differentScores).toBeGreaterThan(n * 0.25);
    expect(attackShots).toBeGreaterThan(parkShots * 1.05);
  });
});

describe('log de comandos e replay', () => {
  it('seed + comandos reproduzem exatamente a mesma partida (jogo em pedaços irregulares)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const opts = { seed, knockout: true, detail: 'full' as const };
      const live = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], opts);
      live.playThrough(10.3);
      live.setTactics(0, ATTACK);
      live.playThrough(37.7);
      const field = live.onPitch(0).filter((p) => p.position !== 'GK');
      const bench = live.benchPlayers(0).filter((p) => p.position !== 'GK');
      live.substitute(0, field[2]!.id, bench[0]!.id);
      live.playThrough(61);
      live.setTactics(0, PARK);
      live.playThrough(88.2);
      live.substitute(0, field[3]!.id, bench[1]!.id);
      const original = live.playToEnd();
      expect(live.commands.length).toBeGreaterThanOrEqual(4);

      const again = replayMatch([setup('BRA-1970', false), setup('GER-1980', true)], opts, live.commands);
      expect(again).toEqual(original);
    }
  });

  it('comandos inválidos não entram no log', () => {
    const sim = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed: 4 });
    sim.playThrough(20);
    const bench = sim.benchPlayers(0);
    expect(sim.substitute(0, 'inexistente', bench[0]!.id)).toBe(false);
    expect(sim.commands).toHaveLength(0);
  });

  it('o registro da partida do torneio sobrevive a JSON e reproduz o mesmo jogo', () => {
    const nation = get('BRA-1970');
    const squad = autoSquad23(squadOf(nation));
    const lineup = autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle));
    const t: Tournament = createTournament(world, nation.id, squad.map((p) => p.id), lineup, 99);
    const fixture = userFixture(t, world)!;
    const setups: [TeamSetup, TeamSetup] = [
      buildSetup(world, t, fixture.home, fixture.home === t.userNationId),
      buildSetup(world, t, fixture.away, fixture.away === t.userNationId),
    ];
    const record = startRecord(t, fixture, setups);
    const sim = new MatchSimulator(setups, { seed: fixtureSeed(t, fixture), knockout: false, detail: 'full' });
    const side = record.userSide;
    sim.playThrough(33.3);
    sim.setTactics(side, ATTACK);
    sim.playThrough(70);
    const field = sim.onPitch(side).filter((p) => p.position !== 'GK');
    sim.substitute(side, field[0]!.id, sim.benchPlayers(side).filter((p) => p.position !== 'GK')[0]!.id);
    const original = sim.playToEnd();
    record.commands = [...sim.commands];

    const saved = JSON.parse(JSON.stringify(record)) as typeof record;
    expect(replayRecord(world, saved)).toEqual(original);
  });
});
