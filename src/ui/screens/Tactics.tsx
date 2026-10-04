import { useMemo, useState } from 'react';
import { FORMATION_SLOTS, FORMATIONS } from '../../engine/formations';
import { assignSlots, autoLineup, fit } from '../../engine/lineup';
import { overall } from '../../engine/player';
import type { Formation, Lineup, Player, Tactics as TacticsT } from '../../engine/types';
import { Bar, NationName, PosPill } from '../components/common';
import { squadOf } from '../../data/squads';
import { nationsById } from '../world';

interface Props {
  nationId: string;
  called: string[];
  /** Condição atual por jogador (no torneio); sem ela vale a condição do elenco. */
  cond?: Record<string, number>;
  initial?: Lineup;
  /** Formação inicial quando ainda não há escalação (ex.: a escolhida no draft). */
  initialFormation?: Formation;
  confirmLabel: string;
  onConfirm: (lineup: Lineup) => void;
  onBack: () => void;
}

const CONTROLS: { key: 'pressing' | 'lineHeight' | 'tempo'; label: string; low: string; high: string }[] = [
  { key: 'pressing', label: 'Pressão', low: 'Baixa: poupa o fôlego, recupera menos a bola.', high: 'Alta: recupera mais, mas cansa mais e abre espaços.' },
  { key: 'lineHeight', label: 'Linha', low: 'Baixa: protege as costas, cede o meio-campo.', high: 'Alta: sufoca o meio, mas é vulnerável à bola longa e ao contra-ataque.' },
  { key: 'tempo', label: 'Ritmo', low: 'Cadenciado: passes mais seguros, menos chances.', high: 'Acelerado: mais chances e mais cansaço, passes menos precisos.' },
];

export function Tactics({ nationId, called, cond, initial, initialFormation, confirmLabel, onConfirm, onBack }: Props) {
  const nation = nationsById.get(nationId)!;
  const players: Player[] = useMemo(
    () => squadOf(nation).filter((p) => called.includes(p.id)).map((p) => ({ ...p, condition: cond?.[p.id] ?? p.condition })),
    [nation, called, cond],
  );
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const [tactics, setTactics] = useState<TacticsT>(initial?.tactics ?? { formation: initialFormation ?? '4-4-2', pressing: 0.5, lineHeight: 0.5, tempo: 0.5 });
  const [starters, setStarters] = useState<string[]>(() => initial?.starters ?? autoLineup(nationId, players, tactics).starters);

  const slots = FORMATION_SLOTS[tactics.formation];

  const changeFormation = (formation: Formation) => {
    const next = { ...tactics, formation };
    setTactics(next);
    setStarters(assignSlots(starters.map((id) => byId.get(id) as Player), formation));
  };

  const setStarter = (index: number, id: string) =>
    setStarters((prev) => {
      const next = [...prev];
      const existing = next.indexOf(id);
      if (existing >= 0) next[existing] = next[index] as string; // troca de posição
      next[index] = id;
      return next;
    });

  const auto = () => setStarters(autoLineup(nationId, players, tactics).starters);

  const bench = players.filter((p) => !starters.includes(p.id)).sort((a, b) => overall(b) - overall(a));
  const gkOk = byId.get(starters[0] as string)?.position === 'GK';
  const avgCond = starters.reduce((s, id) => s + (byId.get(id)?.condition ?? 0), 0) / 11;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Tática e titulares · <NationName nation={nation} /></h2>
          <div className="muted">Condição média dos titulares: {Math.round(avgCond)}%</div>
        </div>
        <div className="row">
          <button onClick={auto}>Escalação automática</button>
          <button className="ghost" onClick={onBack}>Voltar</button>
          <button
            className="primary"
            disabled={!gkOk}
            title={gkOk ? '' : 'O primeiro titular precisa ser goleiro'}
            onClick={() => onConfirm({ nationId, tactics, starters, bench: bench.map((p) => p.id) })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <div className="cols">
        <div className="panel">
          <h3>Formação</h3>
          <div className="opts" style={{ marginBottom: 14 }}>
            {FORMATIONS.map((f) => (
              <button key={f} className={tactics.formation === f ? 'active' : ''} onClick={() => changeFormation(f)}>{f}</button>
            ))}
          </div>
          <h3>Controles</h3>
          {CONTROLS.map((c) => (
            <div key={c.key}>
              <div className="slider">
                <span>{c.label}</span>
                <input type="range" min={0} max={100} value={Math.round(tactics[c.key] * 100)} onChange={(e) => setTactics({ ...tactics, [c.key]: Number(e.target.value) / 100 })} />
                <span className="muted">{Math.round(tactics[c.key] * 100)}%</span>
              </div>
              <p className="hint">{tactics[c.key] >= 0.5 ? c.high : c.low}</p>
            </div>
          ))}
          <h3 style={{ marginTop: 14 }}>Banco ({bench.length})</h3>
          <table>
            <tbody>
              {bench.map((p) => (
                <tr key={p.id}>
                  <td><PosPill p={p} /></td>
                  <td>{p.name}</td>
                  <td className="num"><b>{Math.round(overall(p))}</b></td>
                  <td style={{ width: 70 }}><Bar value={p.condition} kind="cond" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Titulares ({tactics.formation})</h3>
          {slots.map((slot, i) => {
            const p = byId.get(starters[i] as string);
            const f = p ? fit(p, slot) : 0;
            return (
              <div key={i} className="slot-row">
                <span className={`pill pos-${slot === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'WB'].includes(slot) ? 'DEF' : ['DM', 'CM', 'AM'].includes(slot) ? 'MID' : 'FWD'}`}>{slot}</span>
                <select value={starters[i]} onChange={(e) => setStarter(i, e.target.value)}>
                  {players.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.slot} · {Math.round(overall(c))}
                    </option>
                  ))}
                </select>
                <span className={f < 0.9 ? 'bad' : 'muted'} title="Encaixe na posição">{Math.round(f * 100)}%</span>
                <b>{p ? Math.round(overall(p)) : '-'}</b>
                <Bar value={p?.condition ?? 0} kind="cond" />
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: '.82rem' }}>Encaixe abaixo de 90% = jogador fora da posição natural, com rendimento reduzido.</p>
        </div>
      </div>
    </div>
  );
}
