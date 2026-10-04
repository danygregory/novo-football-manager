import { useMemo, useState } from 'react';
import { cutSizes, type Cut } from '../../engine/tournament';
import type { Decade } from '../../engine/types';
import { world } from '../world';

const DECADES: Decade[] = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function CupSetup({ initial, busy, onStart, onBack }: { initial: Cut; busy: boolean; onStart: (cut: Cut) => void; onBack: () => void }) {
  const [cut, setCut] = useState<Cut>(initial);
  const sizes = useMemo(() => cutSizes(world), []);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Recorte da Copa</h2>
          <div className="muted">A Copa tem 32 seleções: a sua e 31 sorteadas do recorte, em 4 potes por força, como no sorteio real.</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={onBack} disabled={busy}>Voltar</button>
          <button className="primary" onClick={() => onStart(cut)} disabled={busy}>{busy ? 'Sorteando…' : 'Sortear a Copa'}</button>
        </div>
      </div>
      <div className="choices">
        <button className={cut === 'all' ? 'sel' : ''} onClick={() => setCut('all')}>
          <b>Todas as eras</b>
          <span>31 adversárias sorteadas entre as {world.nations.length} seleções-era de 1930 a 2020 (décadas e gerações), no máximo uma por país. Seleções fracas e lendárias na mesma Copa.</span>
        </button>
      </div>
      <h3 style={{ marginTop: 14 }}>Ou uma década específica</h3>
      <div className="opts">
        {DECADES.map((d) => {
          const n = sizes.get(d) ?? 0;
          return (
            <button key={d} className={cut === d ? 'active' : ''} disabled={n < 32} onClick={() => setCut(d)} title={n < 32 ? 'Poucos países com jogos suficientes' : `${n} países diferentes`}>
              Anos {String(d).slice(2)} <span className="muted">({n} países)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
