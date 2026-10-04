# Calibração do motor

`npm run calibrate` simula 20.000 jogos em campo neutro (seed 2026) e compara com os alvos. `npm run calibrate -- 20000 '{"k":2}'` testa parâmetros alternativos sem editar o código. Os testes (`src/engine/calibration.test.ts`) repetem a checagem com 5.000 jogos. `scripts/tune.ts` é a busca automática de parâmetros.

Há duas populações:

- **Nível da Copa** (seleções-era com Elo >= 1650): é a população das metas do prompt e a que se compara com os jogos reais entre seleções desse nível.
- **Mundo inteiro** (todas as 561 seleções-era, inclusive as fracas): confere o comportamento contra seleções fracas, comparado com todos os jogos reais da base (1930 em diante, sem amistosos).

## Alvos e resultado (20.000 jogos, nível da Copa)

| Métrica | Alvo | Resultado |
| --- | --- | --- |
| Gols por jogo | 2,5 a 2,8 | 2,69 |
| Empates | 23% a 28% | 25,0% |
| Mais forte vence mais, com zebras em toda faixa | sim | sim (zebra de 11,6% a 32,5%) |
| Mesma década: gols a até 0,3 da média real | todas as décadas com 8 ou mais seleções-era no nível | todas (maior desvio: 0,16 em 1950) |

Mesma década (simulado contra real): 1930 3,78 x 3,85 · 1940 4,17 x 4,21 · 1950 3,90 x 3,74 · 1960 2,85 x 2,82 · 1970 2,55 x 2,46 · 1980 2,28 x 2,26 · 1990 2,39 x 2,38 · 2000 2,49 x 2,47 · 2010 2,54 x 2,50 · 2020 2,66 x 2,55.

## Referência real por faixa de diferença de Elo

Pontos = vitória 1, empate 0,5, do mais forte; diferença de Elo antes do jogo, sem mando. A curva real é mais plana que a fórmula do Elo, porque as seleções fortes enfrentam adversários de nível parecido e os rankings têm ruído.

**Nível da Copa** (jogos reais de 1930 em diante, sem amistosos, Elo >= 1650 dos dois lados):

| Diferença de Elo | Jogos reais | Pontos reais | Pontos simulados | Gols/jogo real | Gols/jogo simulado |
| --- | --- | --- | --- | --- | --- |
| 0-100 | 2.513 | 0,547 | 0,546 | 2,44 | 2,67 |
| 100-200 | 1.503 | 0,648 | 0,625 | 2,51 | 2,67 |
| 200-300 | 653 | 0,714 | 0,702 | 2,60 | 2,70 |
| 300-400 | 184 | 0,709 | 0,778 | 2,54 | 2,81 |
| 400+ | 44 | 0,818 | 0,805 | 2,89 | 3,14 |

**Mundo inteiro** (todas as seleções-era; 10.000 jogos simulados):

| Diferença de Elo | Jogos reais | Pontos reais | Pontos simulados | Gols/jogo real | Gols/jogo simulado |
| --- | --- | --- | --- | --- | --- |
| 0-100 | 3.403 | 0,553 | 0,559 | 2,55 | 2,88 |
| 100-200 | 2.520 | 0,649 | 0,647 | 2,68 | 2,98 |
| 200-300 | 1.423 | 0,711 | 0,730 | 2,80 | 3,06 |
| 300-400 | 543 | 0,759 | 0,812 | 2,93 | 3,32 |
| 400+ | 224 | 0,859 | 0,890 | 3,72 | 3,59 |

Os gols simulados ficam um pouco acima dos reais nas faixas de pouca diferença (a meta de 2,5 a 2,8 gols vale para o nível da Copa). As faixas de 300 em diante têm poucos jogos reais.

## Ambiente de gols da era

Os gols por jogo variam muito entre décadas (3,85 em 1930, 2,26 em 1980, entre seleções com Elo >= 1650). Cada partida recebe `goalRate` (média dos dois times, vinda de `World.decades[].goalsPerMatchCompetitive`). O fator `(goalRate / baseGoalRate)^eraExp` aumenta as posses (passos mais curtos) e a qualidade das chances (xG). Em jogos entre eras diferentes vale a média das duas.

## Valores finais (`src/engine/params.ts`)

| Parâmetro | Valor | Efeito |
| --- | --- | --- |
| `k` | 1,597 | Expoente dos duelos `A^k / (A^k + B^k)` |
| `advance0` | DEF 0,92 · MID 0,5603 · ATT 0,4284 | Chance de avançar de zona entre times iguais |
| `stepMinutes` | 0,3792 | Minutos por passo (define o número de posses) |
| `counterBase` | 0,0793 | Chance base de contra-ataque após perda de posse |
| `longBallBase` / `longBall0` | 0,0986 / 0,3 | Bola longa a partir da defesa e sucesso entre iguais |
| `xg` | trabalhada 0,0796 · contra-ataque 0,1447 · cruzamento 0,0543 · bola parada 0,0434 · pênalti 0,76 | xG base por tipo de chance |
| `qualityExp` | 0,4856 | Quanto a vantagem ataque/defesa melhora o xG da chance |
| `conv.slope` | 0,007938 | Logit por ponto de finalizador vs goleiro (centros 65 e 60) |
| `baseGoalRate` / `eraExp` | 2,5 / 0,55 | Ambiente de gols da era |
| `offsideBase` | 0,09 | Impedimento: `0,09 x (0,4 + 1,3 x linha adversária)`, x1,3 em contra-ataque, x1,8 em bola longa |
| `hardSaveXg` / `bigChanceXg` / `postShare` | 0,15 / 0,11 / 0,07 | Defesa difícil, chance clara perdida e trave (sem sorteio extra) |
| `tactics` | attackTempo 0,3 · attackLine 0,2 · pressRecover 0,3 · defLineCompact 0,18 | Postura tática |
| `penalty` | erro 0,04 (baixo) e 0,09 (alto) · trave 0,04 · defesa 0,46 (baixo), 0,27 (alto), 0,6 (meio) | Cobrança de pênalti (ver abaixo) |
| `injuryPerMinute` | 0,00035 | Lesão por jogador por minuto (cresce com o cansaço); cerca de 0,35 por time por jogo |
| `foulBase`, `yellowPerFoul`, `redPerFoul` | 0,10 · 0,16 · 0,006 | Faltas e cartões (não calibrados contra dados reais) |
| `fatigue`, `fatigueImpact` | base 0,08, pressão 0,12, ritmo 0,06, linha 0,03; 0,3 | Fadiga por minuto e peso na força |

Os valores saíram de uma busca por coordenadas (`scripts/tune.ts`) que minimiza o desvio dos alvos acima (nível da Copa e mundo inteiro), com a mesma seed em todas as avaliações, e de um ajuste manual final de `baseGoalRate` e `eraExp` para acomodar as décadas de 1930 e 1940.

## Pênaltis

A cobrança sorteia (ou recebe do usuário) uma de 6 zonas (cantos e meio, alto e baixo) e o goleiro mergulha para esquerda, meio ou direita. Erro e trave dependem do canto (alto erra mais) e da frieza do batedor (finalização e passe, reduzidos pelo cansaço). A defesa só acontece se o goleiro for para a coluna da bola e depende da qualidade dele. Com escolhas automáticas a conversão fica perto de 73% a 75% (teste `penalties.test.ts`).

## Novos eventos e efeito da tática

Por jogo, entre seleções-era sorteadas: impedimento 3,1; defesa difícil 0,75; chance clara perdida 1,15; trave 1,3. Tática trocada no intervalo (45' a 90', Brasil 70 x Alemanha Ocidental 80): ataque total eleva os chutes a favor de 9,4 para 10,8 e o xG de 0,93 para 1,09; retranca total os reduz para 8,0 e 0,80.

## Balanceamento do draft (`npm run draft-balance`)

Robô guloso: a cada rodada escolhe o melhor jogador disponível (nota x encaixe) para uma vaga vazia, e só troca o sorteio (3 trocas) quando a melhor opção vale menos de 60. Depois joga uma Copa com todas as eras, com o time controlado pela mesma IA das outras seleções.

Resultado com **1.000 drafts**, formações alternadas, Copa de todas as eras (sorteio com potes por força):

| Fase mais longe | % dos drafts |
| --- | --- |
| Campeão | **12,9%** |
| Vice | 9,5% |
| Semifinal | 14,6% |
| Quartas | 24,8% |
| Oitavas | 27,1% |
| Grupos | 11,1% |

O alvo era campeão em menos de 40%: o robô vence 12,9% das Copas (contra 3,1% de uma seleção qualquer entre 32). O Elo médio do time do robô é 2.246 contra 1.692 dos adversários, e mesmo assim o mata-mata é de partida única, com zebras. A diferença está em escolher só entre os 40 jogadores de uma seleção sorteada ao acaso (muitas fracas) e ainda ter de preencher cada posição.

## Limites conhecidos

- **k abaixo de 2:** o ponto de partida do prompt era k = 2. Com os elencos gerados (qualidade = 50 + 0,045 x (Elo - 1500)) os duelos ficavam fortes demais, com o mais forte vencendo mais do que a base real mostra. A busca ficou em k = 1,6.
- **Finalizações:** cerca de 32 por jogo, acima do real (perto de 25). Os gols e o xG estão no alvo; o número de chutes não foi um critério.
- **Faltas e cartões:** só plausíveis (cerca de 8 faltas e 1,3 amarelos por jogo), sem referência real.
- **Mando:** não calibrado, porque o MVP joga em campo neutro.
