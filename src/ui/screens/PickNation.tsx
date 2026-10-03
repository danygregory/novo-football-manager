import { useState } from 'react';
import { world } from '../world';
import { Bar, Kit, STYLE_LABEL } from '../components/common';

export function PickNation({ initial, onPick, onBack }: { initial?: string; onPick: (id: string) => void; onBack: () => void }) {
  const [sel, setSel] = useState<string | undefined>(initial);
  const minElo = Math.min(...world.nations.map((n) => n.elo));
  const maxElo = Math.max(...world.nations.map((n) => n.elo));
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Escolha sua seleção</h2>
          <div className="muted">32 seleções-era. A força é o Elo médio da década, calculado de resultados reais.</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={onBack}>
            Voltar
          </button>
          <button className="primary" disabled={!sel} onClick={() => sel && onPick(sel)}>
            Escolher
          </button>
        </div>
      </div>
      <div className="grid-nations">
        {world.nations.map((n) => (
          <button key={n.id} className={`nation-card ${sel === n.id ? 'selected' : ''}`} onClick={() => setSel(n.id)} onDoubleClick={() => onPick(n.id)}>
            <div className="title">
              <Kit nation={n} />
              {n.country}
            </div>
            <div className="meta">
              <span className="chip accent">anos {String(n.decade).slice(2)}</span>
              <span className="chip">{STYLE_LABEL[n.playStyle]}</span>
              <span className="chip">{n.continent}</span>
            </div>
            <div className="row between muted" style={{ fontSize: '.8rem', marginBottom: 4 }}>
              <span>Força</span>
              <span>Elo {Math.round(n.elo)}</span>
            </div>
            <Bar value={n.elo - minElo + 40} max={maxElo - minElo + 40} />
          </button>
        ))}
      </div>
    </div>
  );
}
