import type { Formation, Position, Slot } from './types';

/** Slots dos 11 titulares, na ordem usada por Lineup.starters (goleiro primeiro). */
export const FORMATION_SLOTS: Record<Formation, Slot[]> = {
  '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'],
  '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'CM', 'AM', 'LW', 'ST', 'RW'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'WB', 'DM', 'CM', 'AM', 'WB', 'ST', 'ST'],
  '5-4-1': ['GK', 'WB', 'CB', 'CB', 'CB', 'WB', 'LW', 'CM', 'CM', 'RW', 'ST'],
};

export const FORMATIONS = Object.keys(FORMATION_SLOTS) as Formation[];

const SLOT_POSITION: Record<Slot, Position> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  WB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'FWD',
  RW: 'FWD',
  ST: 'FWD',
};

export function slotPosition(slot: Slot): Position {
  return SLOT_POSITION[slot];
}
