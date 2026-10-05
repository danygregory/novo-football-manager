import { useMemo, useState } from 'react';
import { FORMATION_SLOTS } from '../../engine/formations';
import { fit } from '../../engine/lineup';
import { overall } from '../../engine/player';
import type { Formation, Player, Position, Slot } from '../../engine/types';
import { canPlace, pick, pickError, pickedIds, reroll, rollSquad, RESERVES, type DraftState } from '../../data/draft';
import { ATTR_LABEL, Kit, PosPill, rowActivate } from '../components/common';
import { nationLabel, world } from '../world';

/** Linhas do campo de cada formação (índices dos slots), do gol ao ataque. */
const ROWS: Record<Formation, number[][]> = {
  '4-4-2': [[0], [1, 2, 3, 4], [5, 6, 7, 8], [9, 10]],
  '4-3-3': [[0], [1, 2, 3, 4], [5, 6, 7], [8, 9, 10]],
  '3-5-2': [[0], [1, 2, 3], [4, 5, 6, 7, 8], [9, 10]],
  '5-4-1': [[0], [1, 2, 3, 4, 5], [6, 7, 8, 9], [10]],
};

const FILTERS: [Position | 'ALL', string][] = [['ALL', 'Todos'], ['GK', 'Goleiros'], ['DEF', 'Defensores'], ['MID', 'Meias'], ['FWD', 'Atacantes']];

export function DraftBoard({ state, onChange, onFinish, onBack }: { state: DraftState; onChange: (s: DraftState) => void; onFinish: () => void; onBack: () => void }) {
  const [sel, setSel] = useState<string | undefined>();
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');
  const [error, setError] = useState<string>();
  const memory = state.config.memory;
  const slots = FORMATION_SLOTS[state.config.formation];
  const nation = world.nations.find((n) => n.id === state.roll);
  const squad = useMemo(() => rollSquad(world, state), [state]);
  const taken = pickedIds(state);
  const selected = squad.find((p) => p.id === sel);
  const done = state.phase === 'done';
  const picks = state.starters.filter(Boolean).length + state.reserves.length;

  const rows = useMemo(
    () =>
      squad
        .filter((p) => filter === 'ALL' || p.position === filter)
        .sort((a, b) => ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.position) - ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.position) || (memory ? a.name.localeCompare(b.name) : overall(b) - overall(a))),
    [squad, filter, memory],
  );

  const place = (slot: number | null) => {
    if (!selected) return;
    const err = pickError(world, state, selected.id, slot);
    if (err) {
      setError(err);
      return;
    }
    setError(undefined);
    setSel(undefined);
    onChange(pick(world, state, selected.id, slot));
  };

  const doReroll = () => {
    setSel(undefined);
    setError(undefined);
    onChange(reroll(world, state));
  };

  const slotCard = (i: number) => {
    const slot = slots[i] as Slot;
    const p = state.starters[i];
    const can = !!selected && state.phase === 'starters' && !p && canPlace(selected, slot);
    return (
      <button key={i} className={`dslot ${p ? 'filled' : ''} ${can ? 'can' : ''}`} disabled={!can} onClick={() => place(i)} title={p ? p.name : 'Posição vazia'}>
        <span className={`pill pos-${slotGroup(slot)}`}>{slot}</span>
        {p ? (
          <>
            <b>{p.name.split(' ').slice(-1)[0]}</b>
            {!memory && <span className="muted">{Math.round(overall(p))}{fit(p, slot) < 0.9 ? ` · ${Math.round(fit(p, slot) * 100)}%` : ''}</span>}
          </>
        ) : (
          <span className="muted">{can ? 'escolher aqui' : 'vazia'}</span>
        )}
      </button>
    );
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <h2>Draft · {state.config.name}</h2>
          <div className="muted">
            {done ? 'Draft concluído.' : state.phase === 'starters' ? `Titulares: ${state.starters.filter(Boolean).length}/11` : `Reservas: ${state.reserves.length}/${RESERVES}`} · {state.config.formation}{memory ? ' · modo Memória' : ''}
          </div>
        </div>
        <div className="row">
          <button className="ghost" onClick={onBack}>Sair</button>
          {done ? (
            <button className="primary" onClick={onFinish}>Montar o elenco e seguir</button>
          ) : (
            <button disabled={state.rerollsLeft <= 0} onClick={doReroll} title="Sorteia outra seleção-era (não dá para voltar)">Trocar sorteio ({state.rerollsLeft})</button>
          )}
        </div>
      </div>
      <div className="bar" style={{ marginBottom: 12 }}><i style={{ width: `${(picks / (11 + RESERVES)) * 100}%` }} /></div>
      {error && <div className="error">{error}</div>}

      <div className="draft-grid">
        <div className="panel">
          <h3>Seu time</h3>
          <div className="dpitch">
            {[...(ROWS[state.config.formation] ?? [])].reverse().map((r, k) => (
              <div key={k} className="drow">{r.map((i) => slotCard(i))}</div>
            ))}
          </div>
          <h3 style={{ marginTop: 12 }}>Reservas ({state.reserves.length}/{RESERVES})</h3>
          <div className="reserves">
            {state.reserves.map((p) => (
              <span key={p.id} className="chip">{p.slot} {p.name.split(' ').slice(-1)[0]}{memory ? '' : ` ${Math.round(overall(p))}`}</span>
            ))}
            {state.phase === 'starters' && <span className="muted">Depois dos 11 titulares, sorteio rápido de {RESERVES} reservas.</span>}
          </div>
          {done && <p className="muted">Os 5 jogadores que faltam para 23 são completados com jogadores medianos gerados.</p>}
        </div>

        <div className="panel">
          {done ? (
            <p>Draft completo. Clique em "Montar o elenco e seguir".</p>
          ) : nation ? (
            <>
              <div className="row between">
                <h3 style={{ margin: 0 }}><Kit nation={nation} />{nationLabel(nation)}</h3>
                {!memory && <span className="chip accent">Elo {Math.round(nation.elo)}</span>}
              </div>
              <div className="muted" style={{ margin: '4px 0 8px' }}>
                {state.phase === 'starters' ? 'Escolha 1 jogador e depois a posição vazia onde ele vai jogar.' : 'Escolha 1 reserva.'}
              </div>
              <div className="tabs">
                {FILTERS.map(([k, label]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}</button>)}
              </div>
              <div className="draft-list">
                <table>
                  <thead>
                    <tr>
                      <th>Pos</th><th>Nome</th><th className="num">Idade</th><th>Estilo</th>
                      {!memory && ATTR_LABEL.filter(([k]) => k !== 'goleiro').map(([, l]) => <th key={l} className="num">{l}</th>)}
                      {!memory && <th className="num">GER</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p: Player) => (
                      <tr key={p.id} className={`clickable ${sel === p.id ? 'called' : ''} ${taken.has(p.id) ? 'taken' : ''}`} {...rowActivate(() => !taken.has(p.id) && setSel(p.id), sel === p.id)}>
                        <td><PosPill p={p} /></td>
                        <td>{p.name}</td>
                        <td className="num">{p.age}</td>
                        <td className="muted">{p.style}</td>
                        {!memory && ATTR_LABEL.filter(([k]) => k !== 'goleiro').map(([k]) => <td key={k} className="num">{p.attrs[k]}</td>)}
                        {!memory && <td className="num"><b>{Math.round(overall(p))}</b></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.phase === 'reserves' && (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="primary" disabled={!selected} onClick={() => place(null)}>Convocar {selected ? selected.name : 'reserva'}</button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function slotGroup(slot: Slot): Position {
  return slot === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'WB'].includes(slot) ? 'DEF' : ['DM', 'CM', 'AM'].includes(slot) ? 'MID' : 'FWD';
}
