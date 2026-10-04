# Fase 6.7: variedade e motivos para não escolher sempre Brasil ou Argentina

## Diagnóstico (antes da fase)

- 561 seleções-era (só décadas, de 1930 a 2020).
- A força absoluta (Elo) cresce com o tempo: mediana de 1.522 em 1930 contra 1.829 em 2020. As 10 mais fortes em "todas as eras" eram todas de 2010 e 2020: Argentina 2020 (2.176), Brasil 2020, Espanha 2020, França 2020, Brasil 2010, Espanha 2010, Alemanha 2010, Inglaterra 2020, Portugal 2020, Bélgica 2020. Escolher sempre a mais forte era a estratégia óbvia.

## O que mudou

1. **Seleções-era com identidade** (`src/data/eras.ts`, `src/data/world.ts`): além das 561 décadas, **280 gerações** de 4 a 8 anos (ex.: "Hungria 1954–57"), detectadas por picos de Elo acima da média da própria seleção, descontando a inflação do Elo ao longo dos anos. Total: **841 seleções-era**. Cada uma tem a força na época (percentil entre as seleções da mesma década), o estilo, o craque com traço especial e um resumo factual da campanha real. Não há nome real de jogador. Em cada Copa entra no máximo uma seleção-era por país.
2. **Carreira de técnico** (`src/engine/career.ts`): começa com 3 seleções sorteadas dos potes 3 e 4; reputação de 0 a 100; depois de cada Copa, 0 a 3 convites compatíveis com a reputação; histórico de Copas, títulos, melhor campanha e seleções treinadas, salvo no navegador. A Copa da carreira usa adversários da mesma década da seleção.
3. **Pontuação, conquistas e ranking** (`src/engine/scoring.ts`): pontos por jogo e por campanha multiplicados pela diferença de força; 20 conquistas; ranking local com as 20 melhores campanhas.
4. **Desafio do dia** (`src/engine/daily.ts`): a data vira a seed (mesma seleção fraca, mesma Copa para todos); resultado compartilhável em texto, sem rede e sem dados pessoais.
5. **Tela inicial:** Carreira, Desafio do dia, Draft, Seleção pronta, nessa ordem.

## Reputação na carreira

Depois de cada Copa:

```
delta = 7 x desempenho + 5 x (etapa alcançada - etapa esperada) + 6 se campeão     (limitado de -18 a +30)
desempenho = soma de (resultado - esperado pelo Elo) em cada jogo
etapa esperada pela posição de força entre as 32: 1º-2º 3,6 · 3º-4º 3,0 · 5º-8º 2,2 · 9º-16º 1,2 · 17º-24º 0,6 · 25º-32º 0,25
etapa: 0 grupos, 1 oitavas, 2 quartas, 3 semifinal, 4 vice, 5 campeão
```

Número de convites: 3 para campeão ou delta >= 12; 2 para delta >= 5; 1 para delta >= -2; 0 abaixo disso. Os convites são seleções-era cujo percentil de força no mundo fica entre `reputação - 22` e `reputação + 14`, de países diferentes do atual.

## Pontuação

```
pontos do jogo = base x multiplicador       base: vitória 10 · empate 4 · vitória nos pênaltis 7 · derrota 0
multiplicador  = 1 + (Elo do adversário - Elo do time) / 400, limitado de 0,35 a 2,5
campanha       = bônus da etapa (0, 20, 40, 80, 120, 200) x multiplicador do campo
multiplicador do campo = 1 + (Elo médio das 32 - Elo do time) / 300, limitado de 0,5 a 3
```

Exemplo real: a Argentina 2020 (a mais forte) campeã invicta fez 128 pontos; um campeão de pote 4 faz bem mais.

## Conquistas (20)

Estreia em Copas · Campeão do mundo · Cinderela (campeão do pote 4) · Azarão na final · Zebra de grupo · Eliminou o favorito · Invicto na Copa · Fase de grupos perfeita · Muralha · Defesa de ferro · Goleada histórica · Festival de gols · Virada · Herói dos pênaltis · Artilheiro da Copa · Melhor jogador da Copa · Campeão do draft · Primeiro título na carreira · Técnico respeitado (80 de reputação) · Desafio cumprido · Desafio perfeito.

## Dados salvos no navegador

`novo-fm-career`, `novo-fm-achievements`, `novo-fm-ranking`, `novo-fm-daily`, `novo-fm-stats` e `novo-fm-settings` (localStorage). Nenhum dado sai do navegador. A Fase 7 (save/load) deve migrar isso para a mesma estrutura de saves.
