import { SPEEDS, type Speed } from '../speed';
import { STAGE_LABEL, type Fixture, type Tournament } from '../../engine/tournament';
import { Bar, NationName, STYLE_LABEL } from '../components/common';
import { nationsById } from '../world';

export function MatchIntro({ t, fixture, busy, onInstant, onWatch, lastSpeed, onBack }: { t: Tournament; fixture: Fixture; busy: boolean; onInstant: () => void; onWatch: (speed: Speed) => void; lastSpeed: Speed; onBack: () => void }) {
  const home = nationsById.get(fixture.home)!;
  const away = nationsById.get(fixture.away)!;
  const mineIsHome = fixture.home === t.userNationId;
  const tac = t.userLineup.tactics;
  const knockout = !fixture.stage.startsWith('G');
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>{STAGE_LABEL[fixture.stage]}</h2>
          <div className="muted">Campo neutro{knockout ? ' · mata-mata: empate vai para prorrogação e pênaltis' : ''}</div>
        </div>
        <button className="ghost" onClick={onBack} disabled={busy}>Voltar</button>
      </div>
      <div className="panel scoreboard">
        <div className="teams">
          <div className="left"><NationName nation={home} /></div>
          <div className="score muted">x</div>
          <div className="right"><NationName nation={away} /></div>
        </div>
      </div>
      <div className="cols" style={{ marginTop: 16 }}>
        {[home, away].map((n) => (
          <div key={n.id} className="panel">
            <h3><NationName nation={n} /></h3>
            <div className="row between muted"><span>Força (Elo)</span><span>{Math.round(n.elo)}</span></div>
            <Bar value={n.elo - 1450} max={800} />
            <p className="muted" style={{ marginBottom: 0 }}>Estilo: {STYLE_LABEL[n.playStyle]}</p>
          </div>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Seu plano ({mineIsHome ? home.country : away.country})</h3>
        <p style={{ margin: 0 }}>
          Formação <b>{tac.formation}</b> · pressão {Math.round(tac.pressing * 100)}% · linha {Math.round(tac.lineHeight * 100)}% · ritmo {Math.round(tac.tempo * 100)}%
        </p>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        {SPEEDS.map((sp) => (
          <button key={sp} className={sp === lastSpeed ? 'primary' : ''} disabled={busy} onClick={() => onWatch(sp)}>
            {busy && sp === lastSpeed ? 'Preparando…' : `Assistir (${sp}x)`}
          </button>
        ))}
        <button disabled={busy} onClick={onInstant}>Simular instantâneo</button>
      </div>
    </div>
  );
}
