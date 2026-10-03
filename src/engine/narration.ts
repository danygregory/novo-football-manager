import { hashSeed } from './prng';
import type { ShotType, Zone } from './types';

/** Narração em PT-BR. Não usa o PRNG da partida: a variação vem de um hash, então não altera o resultado. */
function variant<T>(options: readonly T[], minute: number, key: string): T {
  return options[(minute * 31 + hashSeed(key)) % options.length] as T;
}

export interface NarrationCtx {
  minute: number;
  team: string;
  opponent: string;
  player?: string;
  other?: string;
  shotType?: ShotType;
  xg?: number;
  zone?: Zone;
}

const ZONE_NAME: Record<Zone, string> = { DEF: 'a defesa', MID: 'o meio-campo', ATT: 'o ataque', BOX: 'a área' };

export function zoneName(z: Zone): string {
  return ZONE_NAME[z];
}

const SHOT_LEAD: Record<ShotType, string[]> = {
  trabalhada: ['Jogada trabalhada,', 'Troca de passes e', 'Boa triangulação,'],
  'contra-ataque': ['Contra-ataque rápido!', 'Sai em velocidade!', 'Transição fulminante!'],
  cruzamento: ['Cruzamento na área,', 'Bola alçada na área,', 'Levanta na área,'],
  'bola-parada': ['Bola parada,', 'Na cobrança,', 'Na bola parada ensaiada,'],
  penalti: ['Pênalti marcado!', 'É pênalti!', 'O árbitro aponta a marca!'],
};

export function narrateGoal(c: NarrationCtx): string {
  const lead = variant(SHOT_LEAD[c.shotType ?? 'trabalhada'], c.minute, `g${c.player}`);
  const assist = c.other && c.shotType !== 'penalti' ? ` Passe de ${c.other}.` : '';
  const end = variant(['GOOOL!', 'Bola na rede!', 'É gol!'], c.minute, `ge${c.player}`);
  return `${lead} ${c.player} finaliza... ${end} ${c.team}.${assist}`;
}

export function narrateSave(c: NarrationCtx): string {
  return variant(
    [`${c.player} chuta e ${c.other} faz a defesa!`, `${c.other} espalma a finalização de ${c.player}.`, `Grande defesa de ${c.other} após chute de ${c.player}.`],
    c.minute,
    `s${c.player}`,
  );
}

export function narrateMiss(c: NarrationCtx): string {
  return variant(
    [`${c.player} chuta para fora.`, `${c.player} finaliza mal e a bola passa longe.`, `Bloqueio da defesa no chute de ${c.player}.`],
    c.minute,
    `m${c.player}`,
  );
}

export function narrateFoul(c: NarrationCtx): string {
  return `Falta de ${c.player} em ${c.other}.`;
}

export function narrateYellow(c: NarrationCtx): string {
  return `Cartão amarelo para ${c.player} (${c.team}).`;
}

export function narrateRed(c: NarrationCtx): string {
  return `Cartão vermelho! ${c.player} (${c.team}) está expulso.`;
}

export function narrateSub(c: NarrationCtx): string {
  return `Substituição no ${c.team}: sai ${c.player}, entra ${c.other}.`;
}

export function narrateAdvance(c: NarrationCtx): string {
  return `${c.team} avança para ${zoneName(c.zone ?? 'MID')}.`;
}

export function narrateTurnover(c: NarrationCtx): string {
  return `${c.opponent} recupera a bola em ${zoneName(c.zone ?? 'MID')}.`;
}

export function narrateShootoutKick(c: NarrationCtx & { scored: boolean }): string {
  return c.scored ? `${c.player} converte a cobrança (${c.team}).` : `${c.player} desperdiça a cobrança (${c.team}).`;
}
