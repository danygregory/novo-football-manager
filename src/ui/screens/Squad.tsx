import { useMemo, useState } from 'react';
import { autoSquad23 } from '../../engine/lineup';
import type { Player, Position } from '../../engine/types';
import { ATTR_LABEL, Bar, NationName, PosPill, ovr } from '../components/common';
import { nationsById } from '../world';

const FILTERS: [Position | 'ALL', string][] = [['ALL', 'Todos'], ['GK', 'Goleiros'], ['DEF', 'Defensores'], ['MID', 'Meias'], ['FWD', 'Atacantes']];

export function Squad({
  nationId, initial, onConfirm, onBack, readOnly, cond,
}: {
  nationId: string;
  initial: string[];
  onConfirm: (ids: string[]) => void;
  onBack: () => void;
  /** Durante a Copa o elenco é só consulta (a convocação já foi fechada). */
  readOnly?: boolean;
  cond?: Record<string, number>;
}) {
  const nation = nationsById.get(nationId)!;
  const [called, setCalled] = useState<Set<string>>(() => new Set(initial.length ? initial : autoSquad23(nation.squad).map((p) => p.id)));
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');

  const rows = useMemo(
    () => nation.squad.filter((p) => (filter === 'ALL' || p.position === filter) && (!readOnly || called.has(p.id))),
    [nation, filter, readOnly, called],
  );
  const count = (pos: Position) => nation.squad.filter((p) => called.has(p.id) && p.position === pos).length;
  const gks = count('GK');
  const valid = called.size === 23 && gks >= 2;

  const toggle = (p: Player) =>
    !readOnly &&
    setCalled((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else if (next.size < 23) next.add(p.id);
      return next;
    });

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>{readOnly ? 'Elenco' : 'Convocação'} · <NationName nation={nation} /></h2>
          <div className="muted">
            {readOnly ? 'Seus 23 convocados.' : `Escolha 23 de ${nation.squad.length}.`} Goleiros {gks} · Defensores {count('DEF')} · Meias {count('MID')} · Atacantes {count('FWD')}
          </div>
        </div>
        <div className="row">
          <span className={`chip ${valid ? 'accent' : ''}`}>{called.size}/23</span>
          {!readOnly && <button onClick={() => setCalled(new Set(autoSquad23(nation.squad).map((p) => p.id)))}>Convocação automática</button>}
          <button className={readOnly ? 'primary' : 'ghost'} onClick={onBack}>Voltar</button>
          {!readOnly && <button className="primary" disabled={!valid} onClick={() => onConfirm([...called])} title={valid ? '' : 'Convoque exatamente 23 jogadores, com ao menos 2 goleiros'}>
            Confirmar
          </button>}
        </div>
      </div>
      <div className="tabs">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th />
              <th>Nome</th>
              <th>Pos</th>
              <th className="num">Idade</th>
              <th>Estilo</th>
              {ATTR_LABEL.map(([, l]) => (
                <th key={l} className="num">{l}</th>
              ))}
              <th className="num">GER</th>
              <th>Condição</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`${readOnly ? '' : 'clickable'} ${called.has(p.id) ? 'called' : ''}`} onClick={() => toggle(p)}>
                <td>{!readOnly && <input type="checkbox" readOnly checked={called.has(p.id)} />}</td>
                <td>{p.name}</td>
                <td><PosPill p={p} /></td>
                <td className="num">{p.age}</td>
                <td className="muted">{p.style}</td>
                {ATTR_LABEL.map(([k]) => (
                  <td key={k} className="num" style={{ opacity: k === 'goleiro' && p.position !== 'GK' ? 0.35 : 1 }}>{p.attrs[k]}</td>
                ))}
                <td className="num"><b>{ovr(p)}</b></td>
                <td style={{ width: 90 }}><Bar value={cond?.[p.id] ?? p.condition} kind="cond" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
