import { useState } from 'react';
import { FORMATIONS } from '../../engine/formations';
import type { Formation } from '../../engine/types';
import type { DraftConfig } from '../../data/draft';
import { DRAFT_MEMORY_REROLLS, DRAFT_REROLLS } from '../../data/draft';

const PRESETS: [string, string][] = [
  ['#1d4ed8', '#ffffff'],
  ['#c8102e', '#ffffff'],
  ['#ffdf00', '#009c3b'],
  ['#006600', '#ffffff'],
  ['#111111', '#f2c744'],
  ['#74acdf', '#ffffff'],
  ['#7c3aed', '#fbbf24'],
  ['#ff6f00', '#111111'],
];

export function DraftSetup({ initial, onStart, onBack }: { initial?: DraftConfig; onStart: (c: Omit<DraftConfig, 'seed'>) => void; onBack: () => void }) {
  const [name, setName] = useState(initial?.name ?? 'Meu Time');
  const [colors, setColors] = useState<[string, string]>(initial?.colors ?? PRESETS[0]!);
  const [formation, setFormation] = useState<Formation>(initial?.formation ?? '4-3-3');
  const [memory, setMemory] = useState(initial?.memory ?? false);
  const ok = name.trim().length > 0;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Monte a sua</h2>
          <div className="muted">Escolha a identidade do time e a formação. Depois começa o sorteio.</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={onBack}>Voltar</button>
          <button className="primary" disabled={!ok} onClick={() => onStart({ name: name.trim(), colors, formation, memory })}>Começar o draft</button>
        </div>
      </div>
      <div className="cols">
        <div className="panel">
          <h3>Nome</h3>
          <input className="text" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} aria-label="Nome do time" />
          <h3 style={{ marginTop: 14 }}>Cores</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button key={p.join()} className={`swatch ${colors[0] === p[0] && colors[1] === p[1] ? 'active' : ''}`} onClick={() => setColors(p)} title={`${p[0]} e ${p[1]}`}
                style={{ background: `linear-gradient(90deg, ${p[0]} 50%, ${p[1]} 50%)` }} aria-label={`Cores ${p[0]} e ${p[1]}`} />
            ))}
          </div>
          <div className="row">
            <label>Principal <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} /></label>
            <label>Secundária <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} /></label>
            <span className="kit" style={{ width: 48, height: 28, background: `linear-gradient(90deg, ${colors[0]} 50%, ${colors[1]} 50%)` }} />
          </div>
          <p className="muted" style={{ fontSize: '.85rem' }}>Sem escudo de federação: só o nome e as cores.</p>
        </div>
        <div className="panel">
          <h3>Formação</h3>
          <div className="opts">
            {FORMATIONS.map((f) => (
              <button key={f} className={formation === f ? 'active' : ''} onClick={() => setFormation(f)}>{f}</button>
            ))}
          </div>
          <h3 style={{ marginTop: 14 }}>Modo</h3>
          <label className="toggle" style={{ fontSize: '.95rem' }}>
            <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} /> Memória: esconde as notas e dá só {DRAFT_MEMORY_REROLLS} troca de sorteio (em vez de {DRAFT_REROLLS})
          </label>
          <p className="muted" style={{ fontSize: '.85rem' }}>No modo normal as notas ficam visíveis. No Memória você escolhe só por posição, idade e estilo do jogador, sem ver nota nem atributos.</p>
        </div>
      </div>
    </div>
  );
}
