# Dados e licenças

## Fonte histórica

| Item | Valor |
| --- | --- |
| Base | [martj42/international_results](https://github.com/martj42/international_results) |
| Arquivos usados | `results.csv`, `shootouts.csv`, `goalscorers.csv` (copiados em `data/raw/`) |
| Licença | **CC0 1.0 Universal** (domínio público), arquivo `LICENSE` na raiz do repositório; cópia em `data/raw/LICENSE-martj42-CC0.txt` |
| Baixado em | 3 de outubro de 2026 (`results.csv`, `shootouts.csv`); 11 de outubro de 2026 (`goalscorers.csv`) |
| SHA-256 `results.csv` | `df35268f8fc341ff7fb93d448b4e40356676ac35300a6b4461fd199a99ac1514` |
| SHA-256 `shootouts.csv` | `2acdc95fdad14f5f17200150a1a4a5fa6c2ccf57d31c8b4f61a2c7d9c0493113` |
| SHA-256 `goalscorers.csv` | `e02b25cfcad3fca9af79a5cf075c33a6875416d6d80e5ab42514535cb0d639fe` (3.442.482 bytes, 47.914 gols) |

O README do repositório não cita a origem dos resultados individuais; a CC0 cobre a compilação. Resultados de jogos são fatos. Mesmo sem exigência, a fonte é creditada aqui e em `data/world.json` (`generatedFrom`).

A Fjelstul World Cup Database (CC-BY-SA 4.0, com nomes reais) **não** é usada no produto.

## Como o mundo é gerado (`npm run build-world`)

1. **Elo:** todos os jogos em ordem cronológica, inicial 1500, estilo World Football Elo. K = 60 (Copa), 50 (finais continentais), 40 (eliminatórias e Nations League), 30 (outros), 20 (amistosos); multiplicador por saldo de gols; vantagem de mando de 100 pontos fora de campo neutro. Jogos sem placar são ignorados.
2. **Décadas:** toda seleção da tabela de países (`src/data/countries.ts`, 72 países) com no mínimo **15 jogos na década**, de **1930 a 2020**. O Elo da era é a média do Elo pré-jogo na década. Os nomes do CSV são os nomes atuais; o jogo usa o nome da época (ex.: "União Soviética", "Alemanha Ocidental"). Saem **561** décadas (33 em 1930, 35 em 1940, 45 em 1950, 60 em 1960, 63 em 1970 e 1980, 67 em 1990, 65 em 2000, 2010 e 2020). O critério é ajustável: `npm run build-world -- --min=20`.
3. **Gerações (picos):** são seleções-era de 4 a 8 anos nomeadas pelo período (ex.: "Hungria 1954–57", id `HUN-1954-1957`), com o Elo médio do período. Duas regras, na mesma ordem de prioridade e sem sobreposição dentro da mesma seleção. Em ambas o Elo é relativo à média de todas as seleções no mesmo ano, para descontar a inflação do Elo, e a janela tem pelo menos 10 jogos:
   - **Acima da própria média:** janelas de 4 a 8 anos em que o Elo ficou pelo menos 55 pontos acima da média da própria seleção; escolhem-se as melhores sem sobreposição (`findPeaks`). Saem **280** gerações; há mais recentes porque as seleções jogam mais hoje, então há mais janelas com jogos suficientes.
   - **Mais fortes do mundo:** em cada janela fixa de 5 anos (1930–34, 1935–39, ...), as **3 seleções de maior Elo relativo** (`findWorldTopWindows`). Esta regra existe porque a anterior deixava de fora as seleções dominantes por décadas (Brasil de 1960 e de 1970, Itália de 1938, Inglaterra de 1966, Alemanha de 1990): como a janela era comparada com a média da carreira inteira, quem sempre foi forte quase nunca "passava" dos 55 pontos. Se a seleção já tem geração no trecho, a nova fica só com o maior trecho livre (mínimo de 4 anos). Saem **31** gerações a mais, quase todas anteriores a 1990. O resumo dessas gerações diz "uma das seleções mais fortes do mundo no período" e a posição (1ª a 3ª), nunca "acima da média da seleção".
   Total: **872 seleções-era** (561 décadas e 311 gerações). O teste `gerações das melhores seleções do mundo` (`src/data/data.test.ts`) confere que toda seleção entre as 3 mais fortes de uma janela de 5 anos tem geração cobrindo pelo menos 3 desses anos.
4. **Dados de cada seleção-era:** força absoluta (`elo` e `strength = 10^((elo - 1800) / 400)`, usada pelo motor), **força na época** (`percentile`, de 0 a 100, entre as décadas da mesma década; nas gerações, a década do meio do período), estilo de jogo, gols marcados e sofridos por jogo, continente, cores, cultura dos nomes, jogos na amostra, campanha real (`record`) e um **resumo factual** (`summary`).
5. **Resumo factual:** escrito só com resultados (jogos, vitórias, empates, derrotas, gols, maior vitória, maior sequência invicta, participações em Copas do Mundo e posição entre as seleções da década). **Não cita nenhum jogador.** Os nomes de adversários são nomes de seleções.
6. **Estilo de jogo:** abertura (gols totais dos jogos da seleção contra a média da década) e domínio (fatia dos gols a favor).
7. **Média de gols por década:** na base inteira e só em jogos entre seleções com Elo >= 1650 (`goalsPerMatchCompetitive`, a referência da calibração).
8. **Elencos sob demanda:** o `world.json` (cerca de 580 KB) guarda **só dados de seleção**. Os ~40 jogadores de cada seleção-era são gerados na hora por `squadOf()` (`src/data/squads.ts`), com seed fixa `squad:<id>`: o elenco é sempre o mesmo. Nomes inventados por cultura (prenome genérico + sobrenome montado por sílabas), nível ligado ao Elo e estilos coerentes com o período.
9. **Craque com traço:** o melhor jogador de cada elenco é o craque, com um traço especial coerente com a posição (ex.: "driblador decisivo", "muralha", "goleiro paredão", "armador cerebral", "artilheiro de área"). O traço reforça os atributos dele e, no motor, aumenta o protagonismo nos chutes (artilheiros, dribladores, camisas 10) ou nos passes decisivos (armadores). Os nomes são inventados e sem semelhança com jogadores reais.
10. **Concentração de gols (`topShare`):** de `goalscorers.csv`, a parte dos gols de cada seleção-era marcados pelo artilheiro principal (gols contra de fora). O arquivo registra o artilheiro de só 14% dos gols dos anos 30, 24% nos 70, 40% nos anos 2000 e 49% nos 2020, mas sempre em jogos inteiros; com poucos gols a medida é ruidosa, então vem encolhida para a mediana (0,17) com peso N / (N + 40), e abaixo de 10 gols não se mede (791 das 872 seleções-era têm a medida). Exemplos: Noruega 2020 0,40, Portugal 1960 0,32, Croácia 1990 0,33; Brasil 1970 0,14. Os nomes dos artilheiros só servem para somar: **nenhum nome entra no `world.json` nem no jogo**, os elencos continuam fictícios.
11. **Perfil de artilheiro no elenco** (`applyScoringProfile`, `src/data/squad.ts`): depois de ids e ordem fixados, a finalização dos 4 melhores atacantes muda conforme o `topShare`. Concentrada (seleção de um craque artilheiro): o atacante principal ganha até 7 (sem passar o craque do elenco) e os 3 seguintes perdem até 5. Espalhada: os 3 seguintes ganham até 4. Valor neutro (0,19) ou ausente: elenco idêntico ao anterior. Ids, nomes, posições, idades e estilos não mudam, então saves e nomes personalizados continuam apontando para os mesmos jogadores. `ENGINE_VERSION` 3.

O `data/world.json` é versionado; rodar `npm run build-world` de novo reproduz o mesmo arquivo (há teste para isso). O jogo nunca acessa a rede.
