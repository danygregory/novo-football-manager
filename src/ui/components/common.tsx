import type { Attributes, NationEra, Player } from '../../engine/types';
import { overall } from '../../engine/player';
import { nationLabel } from '../world';

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

export const POS_LABEL: Record<Player['position'], string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', FWD: 'ATA' };

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
