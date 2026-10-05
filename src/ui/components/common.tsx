import type { KeyboardEvent } from 'react';
import type { Attributes, MatchEvent, NationEra, Player, TeamMatchStats } from '../../engine/types';
import { overall } from '../../engine/player';
import { nationLabel } from '../world';

/** Linha de tabela clicável também por teclado (Tab para focar, Enter ou Espaço para ativar). */
export function rowActivate(onActivate: () => void, selected?: boolean) {
  return {
    tabIndex: 0,
    'aria-selected': selected,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

export function Kit({ nation }: { nation: Pick<NationEra, 'colors'> }) {
  return <span className="kit" style={{ background: `linear-gradient(90deg, ${nation.colors.primary} 50%, ${nation.colors.secondary} 50%)` }} />;
}

export function NationName({ nation, short }: { nation: NationEra; short?: boolean }) {
  return (
    <span>
      <Kit nation={nation} />
      {short ? nation.country : nationLabel(nation)}
    </span>
  );
}

export function Bar({ value, max = 100, kind }: { value: number; max?: number; kind?: 'cond' }) {
  return (
    <div className={`bar ${kind ?? ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function PosPill({ p }: { p: Pick<Player, 'position' | 'slot'> }) {
  return <span className={`pill pos-${p.position}`}>{p.slot}</span>;
}

export const ATTR_LABEL: [keyof Attributes, string][] = [
  ['defesa', 'DEF'],
  ['passe', 'PAS'],
  ['drible', 'DRI'],
  ['finalizacao', 'FIN'],
  ['fisico', 'FÍS'],
  ['velocidade', 'VEL'],
  ['goleiro', 'GOL'],
];

export const ovr = (p: Player) => Math.round(overall(p));

export const STYLE_LABEL: Record<NationEra['playStyle'], string> = {
  retranca: 'retranca',
  posse: 'posse de bola',
  'contra-ataque': 'contra-ataque',
  'jogo-direto': 'jogo direto',
  ofensivo: 'ofensivo',
  equilibrado: 'equilibrado',
};

type StatRow = { key: keyof TeamMatchStats; label: string; fmt?: (v: number) => string };
const POSSESSION: StatRow = { key: 'possession', label: 'Posse', fmt: (v) => `${Math.round(v)}%` };
const XG: StatRow = { key: 'xg', label: 'xG', fmt: (v) => v.toFixed(2) };

/** Linhas de estatística: no intervalo (sem cartões) e no pós-jogo (completas). */
export const STAT_ROWS_LIVE: StatRow[] = [POSSESSION, { key: 'shots', label: 'Finalizações' }, { key: 'shotsOnTarget', label: 'No alvo' }, XG, { key: 'offsides', label: 'Impedimentos' }, { key: 'fouls', label: 'Faltas' }];
export const STAT_ROWS_FULL: StatRow[] = [...STAT_ROWS_LIVE, { key: 'yellows', label: 'Amarelos' }, { key: 'reds', label: 'Vermelhos' }];

/** Barras comparativas das estatísticas dos dois times (o 1º em dourado, o 2º em azul). */
export function StatBars({ stats, rows = STAT_ROWS_LIVE }: { stats: [TeamMatchStats, TeamMatchStats]; rows?: StatRow[] }) {
  return (
    <>
      {rows.map(({ key, label, fmt }) => {
        const x = stats[0][key];
        const y = stats[1][key];
        const total = x + y || 1;
        const f = fmt ?? ((v: number) => String(v));
        return (
          <div key={key} className="statrow">
            <span className="l"><b>{f(x)}</b></span>
            <div>
              <div className="label">{label}</div>
              <div className="split"><i style={{ width: `${(x / total) * 100}%` }} /><i style={{ width: `${(y / total) * 100}%` }} /></div>
            </div>
            <span><b>{f(y)}</b></span>
          </div>
        );
      })}
    </>
  );
}

/** Ícone de cada tipo de evento (narração ao vivo e pós-jogo). */
export const EVENT_ICON: Partial<Record<MatchEvent['type'], string>> = {
  goal: '⚽', save: '🧤', 'hard-save': '🧤', miss: '💨', 'big-miss': '😱', post: '🥅', offside: '🚩', injury: '🚑', foul: '🦶',
  yellow: '🟨', red: '🟥', sub: '🔁', halftime: '⏸', fulltime: '🏁', 'penalty-shootout': '🎯', tactic: '📋', kickoff: '▶',
};
