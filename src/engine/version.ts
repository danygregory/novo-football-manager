/**
 * Versão do comportamento do motor. Suba este número SEMPRE que `npm run golden -- --update` for necessário
 * (parâmetros, regras, ordem de sorteios): partidas gravadas com outra versão não reproduzem o mesmo jogo.
 * O baseline do golden guarda a versão, e o CI falha se os dois não combinarem.
 */
export const ENGINE_VERSION = 1;

export class EngineVersionError extends Error {
  constructor(readonly recorded: number | undefined, readonly current: number) {
    super(`Partida gravada com a versão ${recorded ?? '?'} do motor; a atual é ${current}`);
    this.name = 'EngineVersionError';
  }
}
