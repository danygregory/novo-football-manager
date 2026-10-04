import type { MatchEvent, MatchReport, TeamMatchStats } from '../../engine/types';
import { STAGE_LABEL, type Fixture } from '../../engine/tournament';
import { NationName } from '../components/common';
import { nationsById, playerById } from '../world';

const STAT_ROWS: { key: keyof TeamMatchStats; label: string; fmt?: (v: number) => string }[] = [
  { key: 'possession', label: 'Posse', fmt: (v) => `${Math.round(v)}%` },
  { key: 'shots', label: 'Finalizações' },
  { key: 'shotsOnTarget', label: 'No alvo' },
  { key: 'xg', label: 'xG', fmt: (v) => v.toFixed(2) },
  { key: 'offsides', label: 'Impedimentos' },
  { key: 'fouls', label: 'Faltas' },
  { key: 'yellows', label: 'Amarelos' },
  { key: 'reds', label: 'Vermelhos' },
];

const KEY_EVENTS = new Set(['goal', 'hard-save', 'big-miss', 'post', 'injury', 'yellow', 'red', 'sub', 'halftime', 'fulltime', 'penalty-shootout', 'tactic']);
const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', 'hard-save': '🧤', 'big-miss': '😱', post: '🥅', injury: '🚑', yellow: '🟨', red: '🟥', sub: '🔁', halftime: '⏸', fulltime: '🏁', 'penalty-shootout': '🎯', tactic: '📋' };

export function PostMatch({ report, fixture, userNationId, onContinue }: { report: MatchReport; fixture: Fixture; userNationId: string; onContinue: () => void }) {
  const home = nationsById.get(report.teams[0])!;
  const away = nationsById.get(report.teams[1])!;
  const [a, b] = report.stats;
  const ratingEntries = Object.entries(report.ratings).sort((x, y) => y[1] - x[1]);
  const mvp = ratingEntries[0]?.[0];
  const won = report.score[0] === report.score[1] ? (report.shootout ? (report.shootout[0] > report.shootout[1] ? 0 : 1) : undefined) : report.score[0] > report.score[1] ? 0 : 1;
  const mineSide = report.teams[0] === userNationId ? 0 : 1;
  const outcome = won === undefined ? 'Empate' : won === mineSide ? 'Vitória' : 'Derrota';

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2>Pós-jogo · {STAGE_LABEL[fixture.stage]}</h2>
        <button className="primary" onClick={onContinue}>Continuar</button>
      </div>
      <div className="panel scoreboard">
        <div className="teams">
          <div className="left"><NationName nation={home} /></div>
          <div className="score">{report.score[0]} x {report.score[1]}</div>
          <div className="right"><NationName nation={away} /></div>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          {outcome}
          {report.extraTime && !report.shootout ? ' · decidido na prorrogação' : ''}
          {report.shootout ? ` · pênaltis ${report.shootout[0]} x ${report.shootout[1]}` : ''}
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>Estatísticas</h3>
          {STAT_ROWS.map(({ key, label, fmt }) => {
            const x = a[key];
            const y = b[key];
            const total = x + y || 1;
            const f = fmt ?? ((v: number) => String(v));
            return (
              <div key={key} className="statrow">
                <span className="l"><b>{f(x)}</b></span>
                <div>
                  <div className="label">{label}</div>
                  <div className="split"><i style={{ width: `${(x / total) * 100}%` }} /><i style={{ width: `${(y / total) * 100}%` }} /></div>
                </div>
                <span><b>{f(y)}</b></span>
              </div>
            );
          })}
        </div>
        <div className="panel">
          <h3>Lances</h3>
          <ul className="timeline" style={{ margin: 0, paddingLeft: 18, listStyle: 'none' }}>
            {report.events.filter((e) => KEY_EVENTS.has(e.type)).map((e, i) => (
              <li key={i} className={e.type === 'goal' ? 'mvp' : ''}>
                <span className="muted">{e.minute}'</span> {ICON[e.type] ?? ''} {e.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        {[0, 1].map((side) => {
          const team = nationsById.get(report.teams[side as 0 | 1])!;
          const list = ratingEntries.filter(([id]) => playerById(id)?.nationId === team.id);
          return (
            <div key={side} className="panel">
              <h3>Notas · <NationName nation={team} short /></h3>
              <table>
                <tbody>
                  {list.map(([id, r]) => {
                    const p = playerById(id)!;
                    return (
                      <tr key={id} className={id === mvp ? 'me' : ''}>
                        <td>{p.name}{id === mvp ? ' ★' : ''}</td>
                        <td className="muted">{p.slot}</td>
                        <td className="num"><b>{r.toFixed(1)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
