# Calibração do motor

`npm run calibrate` simula 20.000 jogos em campo neutro entre seleções-era sorteadas (seed 2026) e compara com os alvos. `npm run calibrate -- 20000 '{"k":2}'` testa parâmetros alternativos sem editar o código. Os testes (`src/engine/calibration.test.ts`) repetem a checagem com 5.000 jogos.

## Alvos

| Métrica | Alvo | Resultado (20.000 jogos) |
| --- | --- | --- |
| Gols por jogo | 2,5 a 2,8 | 2,65 |
| Empates | 23% a 28% | 24,9% |
| Mais forte vence mais, com zebras em toda faixa | sim | sim (zebra de 10% a 33%) |
| Mesma década: gols a até 0,3 da média real | todas as décadas | todas (maior desvio: 0,18 em 1980) |

## Referência real por faixa de diferença de Elo

Medida em `results.csv`: jogos de 1950 em diante, sem amistosos, entre seleções com Elo >= 1650, pela diferença de Elo antes do jogo (sem mando). Pontos = vitória 1, empate 0,5, do mais forte. A curva real é mais plana que a fórmula do Elo, porque as seleções fortes enfrentam adversários de nível parecido e os rankings têm ruído.

| Diferença de Elo | Jogos reais | Pontos reais | Pontos simulados | Gols/jogo real | Gols/jogo simulado |
| --- | --- | --- | --- | --- | --- |
| 0-100 | 3.039 | 0,553 | 0,535 | 2,41 | 2,43 |
| 100-200 | 1.830 | 0,660 | 0,609 | 2,51 | 2,55 |
| 200-300 | 826 | 0,726 | 0,701 | 2,64 | 2,64 |
| 300-400 | 259 | 0,739 | 0,753 | 2,61 | 2,86 |
| 400+ | 80 | 0,844 | 0,826 | 2,94 | 3,06 |

As faixas de 300 em diante têm poucos jogos reais, então o desvio ali pesa pouco.

## Ambiente de gols da era

Os gols por jogo variam muito entre décadas (3,74 em 1950, 2,26 em 1980, entre seleções com Elo >= 1650). Para respeitar a média real da década, cada partida recebe `goalRate` (média dos dois times, vinda de `World.decades[].goalsPerMatchCompetitive`). O fator `(goalRate / baseGoalRate)^eraExp` aumenta as posses (passos mais curtos) e a qualidade das chances (xG). Em jogos entre eras diferentes vale a média das duas.

## Valores finais (`src/engine/params.ts`)

| Parâmetro | Valor | Efeito |
| --- | --- | --- |
| `k` | 1,597 | Expoente dos duelos `A^k / (A^k + B^k)` |
| `advance0` | DEF 0,92 · MID 0,609 · ATT 0,42 | Chance de avançar de zona entre times iguais |
| `stepMinutes` | 0,3792 | Minutos por passo (define o número de posses) |
| `counterBase` | 0,0694 | Chance base de contra-ataque após perda de posse |
| `longBallBase` / `longBall0` | 0,1006 / 0,3 | Bola longa a partir da defesa e sucesso entre iguais |
| `xg` | trabalhada 0,0865 · contra-ataque 0,1573 · cruzamento 0,0590 · bola parada 0,0472 · pênalti 0,76 | xG base por tipo de chance |
| `qualityExp` | 0,4496 | Quanto a vantagem ataque/defesa melhora o xG da chance |
| `conv.slope` | 0,00735 | Logit por ponto de finalizador vs goleiro (centros 65 e 60) |
| `baseGoalRate` / `eraExp` | 2,65 / 0,732 | Ambiente de gols da era |
| `offsideBase` | 0,09 | Impedimento: `0,09 x (0,4 + 1,3 x linha adversária)`, x1,3 em contra-ataque, x1,8 em bola longa |
| `hardSaveXg` / `bigChanceXg` / `postShare` | 0,15 / 0,11 / 0,07 | Defesa difícil, chance clara perdida e trave (sem sorteio extra: classificam o mesmo chute) |
| `tactics` | attackTempo 0,3 · attackLine 0,2 · pressRecover 0,3 · defLineCompact 0,18 | Postura tática (ver abaixo) |
| `injuryPerMinute` | 0,00035 | Lesão por jogador por minuto (cresce com o cansaço); cerca de 0,35 por time por jogo |
| `foulBase`, `yellowPerFoul`, `redPerFoul` | 0,10 · 0,16 · 0,006 | Faltas e cartões (não calibrados contra dados reais) |
| `fatigue`, `fatigueImpact` | base 0,08, pressão 0,12, ritmo 0,06, linha 0,03; 0,3 | Fadiga por minuto e peso na força |

Os valores saíram de uma busca por coordenadas (`scripts/tune.ts`) que minimiza o desvio dos alvos acima, com a mesma seed em todas as avaliações. Resultado final (depois da Fase 6.5, com lesões e a IA usando gritos e mudança de formação): 2,65 gols/jogo, 24,9% de empates, todas as décadas a até 0,18 da média real.

## Novos eventos (Fase 6.5, etapa 2)

Por jogo, entre seleções-era sorteadas: impedimento 3,1; defesa difícil 0,75; chance clara perdida 1,15; trave 1,3. Os três últimos só reclassificam finalizações que já existiam (o número de gols não muda). O impedimento é um sorteio novo e por isso exigiu recalibrar.

## Efeito da tática (últimos 30 minutos, 600 jogos Brasil 70 x Alemanha Ocidental 80)

Mudança no minuto 60 em comparação com o time sem mudar:

| Tática | Chutes a favor | Chutes contra | Gols a favor | Gols contra |
| --- | --- | --- | --- | --- |
| Base | 5,2 | 4,6 | 0,37 | 0,39 |
| Ataque total (4-3-3, pressão 100%, linha 95%, ritmo 95%) | 6,3 | 5,9 | 0,50 | 0,55 |
| Retranca total (5-4-1, tudo em 5%) | 4,0 | 4,0 | 0,28 | 0,28 |

Atacar eleva os dois lados (mais variância, bom para quem precisa de gols); recuar derruba os dois (bom para quem defende o placar). Nenhuma das duas é grátis.

## Limites conhecidos

- **k abaixo de 2:** o ponto de partida do prompt era k = 2. Com os elencos gerados (qualidade = 50 + 0,045 x (Elo - 1500)) os duelos ficavam fortes demais, com o mais forte vencendo mais do que a base real mostra. A busca ficou em k = 1,6.
- **Finalizações:** cerca de 31 por jogo, acima do real (perto de 25). Os gols e o xG estão no alvo; o número de chutes não foi um critério.
- **Faltas e cartões:** só plausíveis (cerca de 8 faltas e 1,3 amarelos por jogo), sem referência real.
- **Mando:** não calibrado, porque o MVP joga em campo neutro.
