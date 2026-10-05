/** Erros do navegador que não indicam falha do jogo (não derrubam a tela). */
export function isBenignError(message: string): boolean {
  return /ResizeObserver loop|Script error\.?$|AbortError|The play\(\) request was interrupted/i.test(message);
}

/** Texto de diagnóstico para o jogador copiar e enviar: só a mensagem, o início da pilha e a versão. Nenhum dado pessoal. */
export function describeError(error: unknown, version = 'dev'): string {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  const stack = (e.stack ?? '').split('\n').slice(0, 8).join('\n');
  return [`NOVO Football Manager (${version})`, `${e.name}: ${e.message}`, stack].filter(Boolean).join('\n');
}
