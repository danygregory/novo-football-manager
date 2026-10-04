import { awards, winnerOf, STAGE_LABEL, type Stage, type Tournament } from '../../engine/tournament';
import { NationName } from '../components/common';
import { nationsById, playerById } from '../world';

const REACHED: Record<string, string> = { G1: 'Fase de grupos', G2: 'Fase de grupos', G3: 'Fase de grupos', R16: 'Oitavas de final', QF: 'Quartas de final', SF: 'Semifinais', F: 'Final' };

export function CupEnd({ t, onNewCup, onHome }: { t: Tournament; onNewCup: () => void; onHome: () => void }) {
  const champion = nationsById.get(t.champion as string)!;
  const final = t.results.find((r) => r.stage === 'F');
  const runnerUp = final ? nationsById.get(final.teams.find((id) => id !== t.champion) as string) : undefined;
  const a = awards(t);
  const scorer = a.topScorer ? playerById(a.topScorer.playerId) : undefined;
  const best = a.bestPlayer ? playerById(a.bestPlayer.playerId) : undefined;
  const mine = nationsById.get(t.userNationId)!;
  const myStages = t.results.filter((r) => r.teams.includes(t.userNationId)).map((r) => r.stage);
  const lastStage = (myStages[myStages.length - 1] ?? 'G1') as Stage;
  const iWon = t.champion === t.userNationId;
  const myRecord = t.results.filter((r) => r.teams.includes(t.userNationId));
  const wins = myRecord.filter((r) => winnerOf(r) === t.userNationId).length;

  return (
    <div className="end">
      <div className="trophy">🏆</div>
      <h1>{iWon ? 'Campeão do mundo!' : 'Fim da Copa'}</h1>
      <h2><NationName nation={champion} /></h2>
      {runnerUp && <div className="muted">Vice-campeã: {runnerUp.custom ? runnerUp.country : `${runnerUp.country} · anos ${String(runnerUp.decade).slice(2)}`}</div>}
      <div className="awards">
        <div className="award"><div className="k">Artilheiro</div><div className="v">{scorer?.name ?? '-'}</div><div className="muted">{scorer ? `${nationsById.get(scorer.nationId)!.country} · ${a.topScorer!.goals} gols` : ''}</div></div>
        <div className="award"><div className="k">Melhor jogador</div><div className="v">{best?.name ?? '-'}</div><div className="muted">{best ? `${nationsById.get(best.nationId)!.country} · nota média ${a.bestPlayer!.avg.toFixed(2)} em ${a.bestPlayer!.apps} jogos` : ''}</div></div>
        <div className="award"><div className="k">Sua campanha</div><div className="v">{iWon ? 'Campeã' : REACHED[lastStage]}</div><div className="muted">{mine.country}: {wins} vitórias em {myRecord.length} jogos{!iWon && lastStage !== 'G3' ? ` · parou em: ${STAGE_LABEL[lastStage]}` : ''}</div></div>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="primary" onClick={onNewCup}>Nova Copa</button>
        <button onClick={onHome}>Início</button>
      </div>
    </div>
  );
}
