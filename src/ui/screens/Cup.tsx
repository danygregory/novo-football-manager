import { useMemo, useState } from 'react';
import {
  STAGE_LABEL,
  awards,
  currentFixtures,
  standings,
  userFixture,
  userStatus,
  winnerOf,
  type MatchResult,
  type Stage,
  type Tournament,
} from '../../engine/tournament';
import { Kit, NationName } from '../components/common';
import { nationsById, playerById, world } from '../world';

type Tab = 'groups' | 'bracket' | 'results' | 'scorers';

const nm = (id: string) => nationsById.get(id)!.country;
const decadeTag = (id: string) => {
  const n = nationsById.get(id)!;
  return n.custom ? '★' : n.kind === 'peak' ? `${String(n.span[0]).slice(2)}–${String(n.span[1]).slice(2)}` : String(n.decade).slice(2);
};

function resultLine(r: MatchResult) {
  const so = r.shootout ? ` (${r.shootout[0]}-${r.shootout[1]} pên.)` : r.extraTime ? ' (pror.)' : '';
  return `${nm(r.teams[0])} ${r.score[0]} x ${r.score[1]} ${nm(r.teams[1])}${so}`;
}

export function Cup({
  t, busy, onPlay, onAdjust, onSimulateRest, onSquad, onFinish,
}: {
  t: Tournament;
  busy: boolean;
  onPlay: () => void;
  onAdjust: () => void;
  onSimulateRest: () => void;
  onSquad: () => void;
  onFinish: () => void;
}) {
  const [tab, setTab] = useState<Tab>('groups');
  const status = userStatus(t, world);
  const mine = userFixture(t, world);
  const myGroup = t.groups.findIndex((g) => g.includes(t.userNationId));
  const user = nationsById.get(t.userNationId)!;
  const opp = mine ? nationsById.get(mine.home === t.userNationId ? mine.away : mine.home)! : undefined;
  const avgCond = Math.round(t.userLineup.starters.reduce((s, id) => s + (t.cond[id] ?? 0), 0) / 11);

  return (
    <div>
      <div className="panel next-match" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted">{STAGE_LABEL[t.stage]}</div>
          {t.stage === 'DONE' ? (
            <div className="vs">A Copa terminou.</div>
          ) : mine && opp ? (
            <div className="vs"><NationName nation={user} /> <span className="muted">x</span> <NationName nation={opp} /></div>
          ) : (
            <div className="vs bad">{user.country} está eliminada.</div>
          )}
          {mine && <div className="muted">Condição média dos titulares: {avgCond}%</div>}
        </div>
        <div className="row">
          {t.stage === 'DONE' ? (
            <button className="primary" onClick={onFinish}>Ver campeão e prêmios</button>
          ) : mine ? (
            <>
              <button onClick={onSquad}>Elenco</button>
              <button onClick={onAdjust}>Tática e titulares</button>
              <button className="primary" disabled={busy} onClick={onPlay}>Jogar partida</button>
            </>
          ) : (
            <button className="primary" disabled={busy} onClick={onSimulateRest}>{busy ? 'Simulando…' : 'Simular até o fim'}</button>
          )}
        </div>
      </div>

      <div className="tabs">
        {([['groups', 'Grupos'], ['bracket', 'Mata-mata'], ['results', 'Resultados'], ['scorers', 'Artilharia']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'groups' && (
        <div className="cols-3">
          {t.groups.map((ids, g) => {
            const table = standings(t, g, world);
            const done = t.stage !== 'G1' && t.stage !== 'G2' && t.stage !== 'G3';
            return (
              <div key={g} className={`group ${g === myGroup ? 'mine' : ''}`}>
                <h3>Grupo {String.fromCharCode(65 + g)}</h3>
                <table>
                  <thead>
                    <tr><th>Seleção</th><th className="num">J</th><th className="num">SG</th><th className="num">Pts</th></tr>
                  </thead>
                  <tbody>
                    {table.map((s, i) => (
                      <tr key={s.id} className={`${s.id === t.userNationId ? 'me' : ''} ${done && i < 2 ? 'qual' : ''}`}>
                        <td><Kit nation={nationsById.get(s.id)!} />{nm(s.id)} <span className="muted">{decadeTag(s.id)}</span></td>
                        <td className="num">{s.played}</td>
                        <td className="num">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
                        <td className="num"><b>{s.points}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>{ids.length} seleções · os 2 primeiros avançam</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'bracket' && <Bracket t={t} />}

      {tab === 'results' && <Results t={t} />}

      {tab === 'scorers' && <Scorers t={t} />}
      <span hidden>{status}</span>
    </div>
  );
}

const KO: Stage[] = ['R16', 'QF', 'SF', 'F'];

function Bracket({ t }: { t: Tournament }) {
  const groupsDone = !['G1', 'G2', 'G3'].includes(t.stage);
  const cols = useMemo(
    () =>
      KO.map((st) => {
        const played = t.results.filter((r) => r.stage === st);
        const upcoming = t.stage === st ? currentFixtures(t, world) : [];
        return { st, played, upcoming };
      }),
    [t],
  );
  if (!groupsDone) return <div className="panel muted">O chaveamento aparece quando a fase de grupos terminar. Os 2 primeiros de cada grupo vão para as oitavas (1º do grupo A contra 2º do B, e assim por diante).</div>;
  return (
    <div className="bracket">
      {cols.map(({ st, played, upcoming }) => (
        <div key={st} className="col">
          <h3>{STAGE_LABEL[st]}</h3>
          {played.map((r) => <Tie key={r.id} home={r.teams[0]} away={r.teams[1]} result={r} mine={r.teams.includes(t.userNationId)} />)}
          {upcoming.map((f) => <Tie key={f.id} home={f.home} away={f.away} mine={f.home === t.userNationId || f.away === t.userNationId} />)}
          {played.length + upcoming.length === 0 && <div className="muted">A definir</div>}
        </div>
      ))}
    </div>
  );
}

function Tie({ home, away, result, mine }: { home: string; away: string; result?: MatchResult; mine: boolean }) {
  const w = result ? winnerOf(result) : undefined;
  const line = (id: string, i: 0 | 1) => (
    <div className={w ? (w === id ? 'win' : 'lose') : ''}>
      <span><Kit nation={nationsById.get(id)!} />{nm(id)} <span className="muted">{decadeTag(id)}</span></span>
      <span>{result ? `${result.score[i]}${result.shootout ? ` (${result.shootout[i]})` : ''}` : ''}</span>
    </div>
  );
  return <div className={`tie ${mine ? 'mine' : ''}`}>{line(home, 0)}{line(away, 1)}</div>;
}

function Results({ t }: { t: Tournament }) {
  const stages = [...new Set(t.results.map((r) => r.stage))].reverse();
  if (stages.length === 0) return <div className="panel muted">Nenhuma partida disputada ainda.</div>;
  return (
    <div className="panel">
      {stages.map((st) => (
        <div key={st} style={{ marginBottom: 14 }}>
          <h3>{STAGE_LABEL[st]}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {t.results.filter((r) => r.stage === st).map((r) => (
              <li key={r.id} className={r.teams.includes(t.userNationId) ? 'mvp' : ''}>{resultLine(r)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Scorers({ t }: { t: Tournament }) {
  const list = Object.entries(t.stats.goals)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15);
  const a = awards(t);
  if (list.length === 0) return <div className="panel muted">Ainda não há gols.</div>;
  return (
    <div className="panel">
      <table>
        <thead><tr><th>#</th><th>Jogador</th><th>Seleção</th><th className="num">Gols</th></tr></thead>
        <tbody>
          {list.map(([id, goals], i) => {
            const p = playerById(id);
            return (
              <tr key={id} className={a.topScorer?.playerId === id ? 'me' : ''}>
                <td>{i + 1}</td>
                <td>{p?.name ?? id}</td>
                <td>{p ? nm(p.nationId) : ''}</td>
                <td className="num"><b>{goals}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
