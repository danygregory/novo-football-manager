# Balanceamento dos modos (carreira, desafio do dia e conquistas)

`npm run modes-balance [-- carreiras dias copas]` usa um robô (a mesma IA que joga as outras seleções, sem trocar tática nem substituir) para cumprir 150 carreiras de 10 Copas, 200 desafios do dia e 300 Copas comuns de todas as eras. O jogador humano, que grita, substitui e muda a tática, tende a ir melhor que o robô: leia os números como piso.

## Primeira rodada: o que o robô mostrou

- **Carreira estagnada.** A reputação média ficava em 20 a 28 depois de 10 Copas; 10% das carreiras chegavam a 0 e 48% das Copas não geravam nenhum convite. Só 9% chegavam a 80.
- **Desafio do dia pesado demais.** 82% dos dias terminavam na fase de grupos e nenhum campeão em 200 dias: "Desafio perfeito" era praticamente impossível.
- **Conquistas inalcançáveis para o robô:** Cinderela, Campeão do draft e Desafio perfeito.

## Ajustes

| Item | Antes | Depois |
| --- | --- | --- |
| Reputação: fracasso | pesava igual ao acerto | pesa 0,6 do acerto (`REP.lossFactor`) |
| Reputação: presença | 0 | +2 por Copa disputada (`REP.participation`) |
| Reputação: limite da queda | -18 | -14 |
| Convites: 1 convite | desempenho >= -2 | desempenho >= -8 |
| Convites: janela de força | reputação -22 a +14 | reputação -25 a +18 |
| Desafio do dia: seleção | percentil 0 a 25 do mundo | percentil 18 a 32 |
| Desafio do dia: adversários | todas as eras | da mesma época da seleção |

## Resultado final (robô)

**Carreira** (150 carreiras, o robô começa pela mais forte das 3 opções e aceita convite que seja claramente melhor):

| Depois da Copa | 1 | 3 | 5 | 7 | 10 |
| --- | --- | --- | --- | --- | --- |
| Reputação média | 23,6 | 32,1 | 40,2 | 45,7 | 52,8 |
| Reputação p10 / p90 | 17 / 34 | 16 / 51 | 19 / 63 | 21 / 70 | 20 / 86 |

- 20% chegam a 80 de reputação em até 10 Copas (em média na 8ª); 21% têm pelo menos um título.
- Convites por Copa: 0 em 4,5%, 1 em 63,1%, 2 em 15,4%, 3 em 16,9%.
- A progressão é gradual e a força importa: por pote, o campeão é 6,5% (pote 1), 2,0% (pote 2), 2,0% (pote 3) e 0% (pote 4, em 297 Copas); a fase de grupos é a parada de 19%, 46%, 58% e 74% respectivamente.

**Desafio do dia** (200 dias): mediana de 14 pontos; grupos 63,5%, oitavas 20,0%, quartas 11,5%, semifinal 2,0%, vice 1,5%, campeão 1,5%. Com tática automática, cerca de 3 de cada 10 dias chegam ao mata-mata; com decisões de um humano, mais.

**Conquistas** (2.000 Copas simuladas, em % das Copas): todas foram desbloqueadas pelo robô, exceto **Campeão do draft**, que o script não simula (o `draft-balance` mostra 16,6% de títulos para o robô guloso). As mais raras: Cinderela (0,05%), Desafio perfeito (0,15%), Azarão na final (0,2%), Defesa de ferro (0,4%) e Festival de gols (0,95%): pensadas como "lendárias". As comuns: Virada (21,5%), Muralha (11%) e Fase de grupos perfeita (8,6%).
