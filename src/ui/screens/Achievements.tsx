import { useState } from 'react';
import { ACHIEVEMENTS, type RankingEntry } from '../../engine/scoring';
import { repo } from '../store';

const MODE_LABEL: Record<RankingEntry['mode'], string> = { career: 'Carreira', daily: 'Desafio do dia', draft: 'Draft', ready: 'Seleção pronta' };

export function Achievements({ onBack }: { onBack: () => void }) {
  const [unlocked, setUnlocked] = useState<Record<string, string>>(() => repo.load('achievements') ?? {});
  const [ranking, setRanking] = useState<RankingEntry[]>(() => repo.load('ranking') ?? []);
  const done = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Conquistas e ranking</h2>
          <div className="muted">Tudo fica salvo só neste navegador. Vencer um favorito vale mais pontos que vencer um time fraco.</div>
        </div>
        <button className="ghost" onClick={onBack}>Início</button>
      </div>
      <div className="cols">
        <div className="panel">
          <h3>Melhores campanhas</h3>
          {ranking.length === 0 ? (
            <p className="muted">Nenhuma campanha ainda. Termine uma Copa para entrar no ranking.</p>
          ) : (
            <table>
              <thead><tr><th>#</th><th>Seleção</th><th>Modo</th><th>Campanha</th><th className="num">Pontos</th></tr></thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className={r.champion ? 'me' : ''}>
                    <td>{i + 1}</td>
                    <td>{r.team} <span className="muted">pote {r.pot}</span></td>
                    <td className="muted">{MODE_LABEL[r.mode]}</td>
                    <td>{r.stageText} <span className="muted">{r.w}V {r.d}E {r.l}D</span></td>
                    <td className="num"><b>{r.points}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ranking.length > 0 && (
            <button className="ghost" style={{ marginTop: 8 }} onClick={() => { if (confirm('Apagar o ranking?')) { repo.remove('ranking'); setRanking([]); } }}>Apagar ranking</button>
          )}
        </div>
        <div className="panel">
          <h3>Conquistas ({done}/{ACHIEVEMENTS.length})</h3>
          <div className="ach-list">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.id} className={`ach ${unlocked[a.id] ? 'on' : ''}`}>
                <span className="ach-ic">{unlocked[a.id] ? '🏅' : '🔒'}</span>
                <div>
                  <b>{a.name}</b>
                  <div className="muted" style={{ fontSize: '.82rem' }}>{a.description}{unlocked[a.id] ? ` · ${unlocked[a.id]}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
          {done > 0 && (
            <button className="ghost" style={{ marginTop: 8 }} onClick={() => { if (confirm('Apagar as conquistas?')) { repo.remove('achievements'); setUnlocked({}); } }}>Apagar conquistas</button>
          )}
        </div>
      </div>
    </div>
  );
}
