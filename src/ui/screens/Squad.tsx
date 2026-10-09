import { useMemo, useState } from 'react';
import { autoSquad23 } from '../../engine/lineup';
import type { Player, Position } from '../../engine/types';
import { ATTR_LABEL, Bar, NationName, PosPill, ovr, rowActivate } from '../components/common';
import { squadOf } from '../../data/squads';
import { nationsById } from '../world';
import { nameOverrides } from '../../data/squads';
import { renamePlayer, restoreNames } from '../names';

const INVALID_SQUAD_HINT = 'Convoque exatamente 23 jogadores, com ao menos 2 goleiros';

const FILTERS: [Position | 'ALL', string][] =[['ALL', 'Todos'], ['GK', 'Goleiros'], ['DEF', 'Defensores'], ['MID', 'Meias'], ['FWD', 'Atacantes']];

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
  const [called, setCalled] = useState<Set<string>>(() => new Set(initial.length ? initial : autoSquad23(squadOf(nation)).map((p) => p.id)));
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');
  /** Força a releitura do elenco depois de renomear (os nomes vêm de squadOf). */
  const [namesVersion, setNamesVersion] = useState(0);
  const [editing, setEditing] = useState<string>();

  const rows = useMemo(
    () => squadOf(nation).filter((p) => (filter === 'ALL' || p.position === filter) && (!readOnly || called.has(p.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nation, filter, readOnly, called, namesVersion],
  );
  const count = (pos: Position) => squadOf(nation).filter((p) => called.has(p.id) && p.position === pos).length;
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
            {readOnly ? 'Seus 23 convocados.' : `Escolha 23 de ${squadOf(nation).length}.`} Goleiros {gks} · Defensores {count('DEF')} · Meias {count('MID')} · Atacantes {count('FWD')}
          </div>
          {!readOnly && !valid && <div className="muted" role="status">{INVALID_SQUAD_HINT}</div>}
        </div>
        <div className="row">
          <span className={`chip ${valid ? 'accent' : ''}`}>{called.size}/23</span>
          {squadOf(nation).some((p) => Object.hasOwn(nameOverrides(), p.id)) && (
            <button className="ghost" onClick={() => { restoreNames(squadOf(nation).map((p) => p.id)); setNamesVersion((v) => v + 1); }}>Restaurar nomes originais</button>
          )}
          {!readOnly && <button onClick={() => setCalled(new Set(autoSquad23(squadOf(nation)).map((p) => p.id)))}>Convocação automática</button>}
          <button className={readOnly ? 'primary' : 'ghost'} onClick={onBack}>Voltar</button>
          {!readOnly && <button className="primary" disabled={!valid} onClick={() => onConfirm([...called])} title={valid ? '' : INVALID_SQUAD_HINT}>
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
        <table className="squad-table">
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
              <tr key={p.id} className={`${readOnly ? '' : 'clickable'} ${called.has(p.id) ? 'called' : ''}`} {...(readOnly ? {} : rowActivate(() => toggle(p), called.has(p.id)))}>
                <td>{!readOnly && <input type="checkbox" readOnly tabIndex={-1} aria-label={`Convocado: ${p.name}`} checked={called.has(p.id)} />}</td>
                <td>
                  {editing === p.id ? (
                    <input
                      className="name-edit"
                      autoFocus
                      maxLength={40}
                      defaultValue={p.name}
                      aria-label={`Novo nome para ${p.name}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setEditing(undefined);
                      }}
                      onBlur={(e) => {
                        if (editing === p.id && e.currentTarget.value !== p.name) {
                          renamePlayer(p.id, e.currentTarget.value);
                          setNamesVersion((v) => v + 1);
                        }
                        setEditing(undefined);
                      }}
                    />
                  ) : (
                    <>
                      {p.name}
                      <button className="ghost icon-btn" title="Renomear este jogador (fica só no seu navegador)" aria-label={`Renomear ${p.name}`} onClick={(e) => { e.stopPropagation(); setEditing(p.id); }}>✎</button>
                    </>
                  )}
                </td>
                <td><PosPill p={p} /></td>
                <td className="num">{p.age}</td>
                <td className="muted">{p.style}</td>
                {ATTR_LABEL.map(([k]) => (
                  <td key={k} className="num" style={k === 'goleiro' && p.position !== 'GK' ? { color: 'var(--muted)' } : undefined}>{p.attrs[k]}</td>
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
