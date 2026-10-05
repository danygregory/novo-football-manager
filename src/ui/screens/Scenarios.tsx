import { SCENARIOS, type Scenario, type ScenarioResult } from '../../engine/scenarios';
import type { ScenarioBest } from '../../save';
import { Kit } from '../components/common';
import { eraSpan, nationsById } from '../world';

function ScenarioCard({ sc, best, onPlay, onPick, friend }: { sc: Scenario; best?: ScenarioBest; onPlay: () => void; onPick: () => void; friend?: number }) {
  const me = nationsById.get(sc.user);
  const opp = nationsById.get(sc.opponent);
  if (!me || !opp) return null;
  return (
    <div className="panel scenario-card">
      <h3 style={{ margin: 0 }}>{sc.title}</h3>
      <p className="muted" style={{ margin: '4px 0 8px', fontSize: '.88rem' }}>{sc.blurb}</p>
      <div className="vs-line">
        <span><Kit nation={me} /> <b>{me.country}</b> <span className="muted">{eraSpan(me)} · Elo {Math.round(me.elo)}</span></span>
        <span className="muted">contra</span>
        <span><Kit nation={opp} /> <b>{opp.country}</b> <span className="muted">{eraSpan(opp)} · Elo {Math.round(opp.elo)}</span></span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={onPlay}>Jogar já</button>
        <button onClick={onPick}>Escalar o time</button>
        {best && <span className="chip accent" title={`em ${best.date}`}>seu melhor: {best.points} pts · {best.text}</span>}
        {friend !== undefined && <span className="chip">amigo: {friend} pts</span>}
      </div>
    </div>
  );
}

/** Lista de cenários, ou um só (link de amigo) com a pontuação dele para bater. */
export function ScenarioList({ best, only, friend, onPlay, onPick, onAll, onBack }: { best: Record<string, ScenarioBest>; only?: Scenario; friend?: number; onPlay: (s: Scenario) => void; onPick: (s: Scenario) => void; onAll: () => void; onBack: () => void }) {
  const list = only ? [only] : SCENARIOS;
  const done = SCENARIOS.filter((s) => best[s.id]).length;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>{only ? 'Desafio de um amigo' : 'Cenários'}</h2>
          <div className="muted">
            {only
              ? 'Uma partida só, com a seed fixa: o mesmo jogo para você e para ele. Monte o time e as decisões do seu jeito.'
              : `Uma partida de mata-mata contra uma seleção de outra época, a mesma para todo mundo. A escalação automática perde por pouco: dá para virar com elenco, tática e decisões. ${done}/${SCENARIOS.length} jogados.`}
          </div>
        </div>
        <div className="row">
          {only && <button onClick={onAll}>Ver todos os cenários</button>}
          <button className="ghost" onClick={onBack}>Início</button>
        </div>
      </div>
      <div className="scenario-grid">
        {list.map((sc) => (
          <ScenarioCard key={sc.id} sc={sc} best={best[sc.id]} friend={only ? friend : undefined} onPlay={() => onPlay(sc)} onPick={() => onPick(sc)} />
        ))}
      </div>
    </div>
  );
}

export function ScenarioOutcome({ sc, res, best, improved }: { sc: Scenario; res: ScenarioResult; best: number; improved: boolean }) {
  const opp = nationsById.get(sc.opponent);
  return (
    <div className="end">
      <div className="trophy">{res.result === 'W' ? '🏆' : '😮‍💨'}</div>
      <h1>{res.text}</h1>
      <h2>{sc.title}</h2>
      <div className="muted">
        {res.score[0]} x {res.score[1]}{res.shootout ? ` (${res.shootout[0]} x ${res.shootout[1]} nos pênaltis)` : ''} contra {opp?.country} {opp ? eraSpan(opp) : ''}
      </div>
      <div className="panel" style={{ textAlign: 'left', margin: '14px auto', maxWidth: 520 }}>
        <div className="row between"><h3 style={{ margin: 0 }}>Pontos</h3><span className="mvp" style={{ fontSize: '1.6rem', fontWeight: 800 }}>{res.points}</span></div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: '.88rem' }}>
          {res.result === 'W' ? `Vitória 100 + saldo de gols${res.underdog ? ` + ${res.underdog} de bônus por vencer um adversário mais forte` : ''}.` : 'Na derrota, 5 pontos por gol marcado (até 20).'}
          {' '}{improved ? 'Novo melhor resultado neste cenário!' : `Seu melhor: ${best} pts.`}
        </p>
      </div>
    </div>
  );
}
