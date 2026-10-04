import type { Achievement, CupSummary } from '../../engine/scoring';
import { nationLabelById } from '../world';

export function ScoreCard({ summary, achievements }: { summary: CupSummary; achievements: Achievement[] }) {
  return (
    <div className="panel" style={{ textAlign: 'left', margin: '14px 0' }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Pontuação da campanha</h3>
        <span style={{ fontSize: '1.6rem', fontWeight: 800 }} className="mvp">{summary.total} pts</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 8px', fontSize: '.88rem' }}>
        {summary.matchPoints} dos jogos + {summary.stageBonus} da campanha ({summary.stageText}, bônus multiplicado por {summary.campaignMult.toFixed(2)} pela força do seu time contra o campo). Vencer um favorito vale mais.
      </p>
      <table>
        <thead><tr><th>Jogo</th><th>Adversário</th><th>Resultado</th><th className="num">Força</th><th className="num">Pontos</th></tr></thead>
        <tbody>
          {summary.matches.map((m) => (
            <tr key={m.id}>
              <td className="muted">{m.stage}</td>
              <td>{nationLabelById(m.opp)}</td>
              <td className={m.result === 'W' ? 'good' : m.result === 'L' ? 'bad' : ''}>{m.result === 'W' ? (m.penalties ? 'Vitória (pên.)' : 'Vitória') : m.result === 'D' ? 'Empate' : 'Derrota'}</td>
              <td className="num">×{m.mult.toFixed(2)}</td>
              <td className="num"><b>{m.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {achievements.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <h3>Conquistas desbloqueadas</h3>
          <div className="ach-list">
            {achievements.map((a) => (
              <div key={a.id} className="ach on">
                <span className="ach-ic">🏅</span>
                <div><b>{a.name}</b><div className="muted" style={{ fontSize: '.82rem' }}>{a.description}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
