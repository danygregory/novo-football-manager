# Dados e licenças

## Fonte histórica

| Item | Valor |
| --- | --- |
| Base | [martj42/international_results](https://github.com/martj42/international_results) |
| Arquivos usados | `results.csv`, `shootouts.csv` (copiados em `data/raw/`) |
| Licença | **CC0 1.0 Universal** (domínio público), arquivo `LICENSE` na raiz do repositório; cópia em `data/raw/LICENSE-martj42-CC0.txt` |
| Baixado em | 3 de outubro de 2026 |
| SHA-256 `results.csv` | `df35268f8fc341ff7fb93d448b4e40356676ac35300a6b4461fd199a99ac1514` |
| SHA-256 `shootouts.csv` | `2acdc95fdad14f5f17200150a1a4a5fa6c2ccf57d31c8b4f61a2c7d9c0493113` |

O README do repositório não cita a origem dos resultados individuais; a CC0 cobre a compilação. Resultados de jogos são fatos. Mesmo sem exigência, a fonte é creditada aqui e em `data/world.json` (`generatedFrom`).

A Fjelstul World Cup Database (CC-BY-SA 4.0, com nomes reais) **não** é usada no produto.

## Como o mundo é gerado (`npm run build-world`)

1. **Elo:** todos os jogos em ordem cronológica, inicial 1500, estilo World Football Elo. K = 60 (Copa), 50 (finais continentais), 40 (eliminatórias e Nations League), 30 (outros), 20 (amistosos); multiplicador por saldo de gols; vantagem de mando de 100 pontos fora de campo neutro. Jogos sem placar são ignorados.
2. **Décadas:** toda seleção da tabela de países (`src/data/countries.ts`, 72 países) com no mínimo **15 jogos na década**, de **1930 a 2020**. O Elo da era é a média do Elo pré-jogo na década. Os nomes do CSV são os nomes atuais; o jogo usa o nome da época (ex.: "União Soviética", "Alemanha Ocidental"). Saem **561** décadas (33 em 1930, 35 em 1940, 45 em 1950, 60 em 1960, 63 em 1970 e 1980, 67 em 1990, 65 em 2000, 2010 e 2020). O critério é ajustável: `npm run build-world -- --min=20`.
3. **Gerações (picos):** para cada seleção, janelas de **4 a 8 anos** com pelo menos 10 jogos em que o Elo (relativo à média de todas as seleções no mesmo ano, para descontar a inflação do Elo) ficou pelo menos 55 pontos acima da média da própria seleção. Escolhem-se as melhores janelas sem sobreposição. Cada pico vira uma seleção-era nomeada pelo período (ex.: "Hungria 1954–57", id `HUN-1954-1957`) e usa o Elo médio do período. Saem **280** gerações; há mais gerações recentes porque as seleções jogam mais hoje, então há mais janelas com jogos suficientes. Total: **841 seleções-era**.
4. **Dados de cada seleção-era:** força absoluta (`elo` e `strength = 10^((elo - 1800) / 400)`, usada pelo motor), **força na época** (`percentile`, de 0 a 100, entre as décadas da mesma década; nas gerações, a década do meio do período), estilo de jogo, gols marcados e sofridos por jogo, continente, cores, cultura dos nomes, jogos na amostra, campanha real (`record`) e um **resumo factual** (`summary`).
5. **Resumo factual:** escrito só com resultados (jogos, vitórias, empates, derrotas, gols, maior vitória, maior sequência invicta, participações em Copas do Mundo e posição entre as seleções da década). **Não cita nenhum jogador.** Os nomes de adversários são nomes de seleções.
6. **Estilo de jogo:** abertura (gols totais dos jogos da seleção contra a média da década) e domínio (fatia dos gols a favor).
7. **Média de gols por década:** na base inteira e só em jogos entre seleções com Elo >= 1650 (`goalsPerMatchCompetitive`, a referência da calibração).
8. **Elencos sob demanda:** o `world.json` (cerca de 580 KB) guarda **só dados de seleção**. Os ~40 jogadores de cada seleção-era são gerados na hora por `squadOf()` (`src/data/squads.ts`), com seed fixa `squad:<id>`: o elenco é sempre o mesmo. Nomes inventados por cultura (prenome genérico + sobrenome montado por sílabas), nível ligado ao Elo e estilos coerentes com o período.
9. **Craque com traço:** o melhor jogador de cada elenco é o craque, com um traço especial coerente com a posição (ex.: "driblador decisivo", "muralha", "goleiro paredão", "armador cerebral", "artilheiro de área"). O traço reforça os atributos dele e, no motor, aumenta o protagonismo nos chutes (artilheiros, dribladores, camisas 10) ou nos passes decisivos (armadores). Os nomes são inventados e sem semelhança com jogadores reais.

O `data/world.json` é versionado; rodar `npm run build-world` de novo reproduz o mesmo arquivo (há teste para isso). O jogo nunca acessa a rede.
