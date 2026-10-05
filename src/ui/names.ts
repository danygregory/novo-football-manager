import { nameOverrides, setNameOverrides } from '../data/squads';
import { playerName } from '../save/guards';
import { engine } from './engineClient';
import { repo } from './store';

/** Carrega os nomes salvos e avisa o worker. Chamado uma vez na abertura do jogo. */
export function initNames(): void {
  const saved = repo.load('names');
  if (!saved || Object.keys(saved).length === 0) return;
  setNameOverrides(saved);
  void engine.call('setNames', { names: { ...saved } }).catch(() => undefined);
}

/** Reaplica os nomes salvos (depois de importar um save): o que não está no save volta ao original. */
export function syncNames(): void {
  const saved = repo.load('names') ?? {};
  setNameOverrides(saved);
  void engine.call('setNames', { names: { ...saved } }).catch(() => undefined);
}

function commit(next: Record<string, string>): void {
  setNameOverrides(next);
  if (Object.keys(next).length === 0) repo.remove('names');
  else repo.save('names', next);
  void engine.call('setNames', { names: next }).catch(() => undefined);
}

/** Renomeia um jogador (nome vazio ou inválido restaura o original). */
export function renamePlayer(playerId: string, raw: string): void {
  const next = { ...nameOverrides() };
  const name = playerName(raw);
  if (name === undefined) delete next[playerId];
  else next[playerId] = name;
  commit(next);
}

/** Restaura os nomes originais de uma lista de jogadores. */
export function restoreNames(playerIds: readonly string[]): void {
  const next = { ...nameOverrides() };
  for (const id of playerIds) delete next[id];
  commit(next);
}
