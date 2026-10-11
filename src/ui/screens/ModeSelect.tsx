export interface ModeHandlers {
  onCareer: () => void;
  hasCareer: boolean;
  onDaily: () => void;
  dailyDone: boolean;
  onDraft: () => void;
  onReady: () => void;
  onScenarios: () => void;
  scenariosDone: number;
}

/** Os três modos para começar, com ícone, duração e uma linha cada. */
export function MainModes({ onScenarios, scenariosDone, onReady, onCareer, hasCareer }: Pick<ModeHandlers, 'onScenarios' | 'scenariosDone' | 'onReady' | 'onCareer' | 'hasCareer'>) {
  return (
    <div className="mode-cards">
      <button className="mode-card" onClick={onScenarios}>
        <span className="mode-icon" aria-hidden="true">⚡</span>
        <b>Cenários{scenariosDone ? ` · ${scenariosDone} jogados` : ''}</b>
        <span className="mode-dur">5 min por partida</span>
        <span className="mode-desc">Uma partida contra outra época, como o Brasil de 70 contra o de hoje. O mesmo jogo para todo mundo.</span>
      </button>
      <button className="mode-card" onClick={onReady}>
        <span className="mode-icon" aria-hidden="true">🏆</span>
        <b>Copa completa</b>
        <span className="mode-dur">cerca de 20 min</span>
        <span className="mode-desc">Escolha uma seleção de qualquer época (Brasil 70, Hungria 54...) e dispute a Copa de 32 seleções.</span>
      </button>
      <button className="mode-card" onClick={onCareer}>
        <span className="mode-icon" aria-hidden="true">📈</span>
        <b>Carreira de técnico{hasCareer ? ' (em andamento)' : ''}</b>
        <span className="mode-dur">várias Copas</span>
        <span className="mode-desc">Comece com uma seleção fraca e suba de nível a cada Copa, recebendo convites de seleções maiores.</span>
      </button>
    </div>
  );
}

/** Os outros modos, recolhidos em "Mais modos" para não competir com os três principais. */
export function MoreModes({ onDaily, dailyDone, onDraft }: Pick<ModeHandlers, 'onDaily' | 'dailyDone' | 'onDraft'>) {
  return (
    <details className="more-modes">
      <summary>Mais modos</summary>
      <div className="choices modes">
        <button onClick={onDaily}>
          <b>Desafio do dia{dailyDone ? ' (já jogado hoje)' : ''}</b>
          <span>Todo mundo recebe hoje a mesma seleção fraca e a mesma Copa. No fim, um resultado em texto para compartilhar. Sem rede e sem dados pessoais.</span>
        </button>
        <button onClick={onDraft}>
          <b>Monte a sua (sorteio de jogadores)</b>
          <span>Defina nome, cores e formação. A cada rodada o jogo sorteia uma seleção e você escolhe 1 jogador dela. São 3 trocas de sorteio.</span>
        </button>
      </div>
    </details>
  );
}
