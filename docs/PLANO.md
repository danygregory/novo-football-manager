# NOVO Football Manager — Mercado, Motor e Arquitetura

Versão de 3 de outubro de 2026 · Dany Gregory

## Sumário executivo

A tese: um manager de futebol web, leve e rápido como o Brasfoot, com profundidade tática moderna, ligas assíncronas entre amigos e monetização sem pay-to-win, empacotado depois do MVP para App Store e Google Play.

A janela existe por três motivos. O Football Manager 26 vendeu bem, mas desagradou o jogador fiel pela interface e pela performance. O Brasfoot não recebe atualização oficial desde 2023. E os managers mobile líderes (Top Eleven, OSM) são criticados como pay-to-win.

O risco também é claro: a ponta indie está lotada (7a0, BrowserFut, Openfoot Manager, A Lenda do Futebol) e mundo fictício já é o padrão. O diferencial precisa estar visível desde o MVP.

**Decisões-chave propostas**

- Mundo inicial só com seleções internacionais fictícias, inspiradas em eras históricas, com força calculada a partir de resultados reais e jogadores com nomes gerados; clubes locais depois, pois exigem licenciamento. Editor local; nada de nomes reais hospedados por nós.
- Simulação no cliente; o MVP roda só no navegador (Chrome), e o app nas lojas vem depois. O servidor entra após o MVP, para login, backup e ligas multiplayer.
- Motor determinístico em TypeScript, com seed, compartilhado entre cliente e servidor.
- Sem loot boxes nem vantagem paga em campo, por produto e por exigência do ECA Digital.
- PWA primeiro, Capacitor para as lojas depois, com o mesmo código.

## Panorama competitivo

O mercado se divide em três grupos: o simulador profundo (FM), os clássicos leves brasileiros e os F2P mobile. Nenhum combina leveza, profundidade moderna e monetização justa.

| Competidor | Grupo | Situação | Lição para nós |
| --- | --- | --- | --- |
| [Football Manager 26](https://www.sportsgamersonline.com/games/soccer/fm26-sales-are-up-as-sega-aknowledges-user-dissatifaction/) | Simulador profundo (PC/console) | Vendas iniciais cerca de 30% acima do FM24 segundo a Sega; avaliações "Mostly Negative" no Steam ([fonte](https://ingenuityfantasy.com/?p=7404)), atribuídas à troca de motor e à nova interface | O jogador veterano pune interface lenta e confusa |
| [Brasfoot](https://tribunademinas.com.br/colunas/maistendencias/?p=49965) | Clássico leve (PC/mobile) | Sem atualização oficial desde 2023; comunidade mantém versões não oficiais; registro grátis no PC ([fonte](https://www.tecmundo.com.br/voxel/502903-brasfoot-libera-registro-gratis-veja-como-baixar-e-jogar-atualmente.htm)) | Público fiel e órfão; patches da comunidade garantem longevidade |
| Elifoot | Clássico leve | Precursor do gênero; inspirou o Brasfoot | Referência de nostalgia, não de tecnologia |
| [Top Eleven](https://apps.apple.com/app/id459035295) | F2P mobile | Partidas 3D em tempo real, 31 idiomas; queixas recorrentes de pay-to-win ([fonte](https://nl-be.trustpilot.com/review/topeleven.com)) | Monetização agressiva gera rejeição: oportunidade de posicionamento |
| [Online Soccer Manager](https://appgoblin.info/apps/400201466) | F2P mobile | Mais de 50 milhões de jogadores declarados, 30 idiomas | Escala vem de multiplayer e de baixa fricção de entrada |
| [7a0](https://www.opovo.com.br/esportes/futebol/copa-do-mundo/2026/06/08/7-a-0-veja-o-que-e-o-jogo-da-copa-do-mundo-que-tem-viralizado.html) | Indie web | Viralizou na Copa de 2026; grátis, sem cadastro, roda no navegador; usa nomes reais (52 seleções, 250 elencos, 5.729 jogadores) | Zero fricção + evento sazonal = viralidade; o draft por era funciona sem nomes reais |
| [BrowserFut](https://criticalhits.com.br/games/browserfoot-manager-de-futebol-pelo-navegador-e-lancado/) | Indie web | 80 times fictícios em quatro divisões; save local + nuvem; funciona offline; feito em cerca de uma semana | Barreira de entrada baixíssima: diferenciação é obrigatória |
| [Openfoot Manager](https://deepwiki.com/openfootmanager/openfootmanager) | Open source (desktop) | Rust + React + Tauri v2; um SQLite por save; elencos reais ou procedurais; GPLv3 | Valida nossa arquitetura; código não pode ser reutilizado em produto fechado |
| [A Lenda do Futebol](https://itch.io/profile/lazymugstudio) | Indie (itch.io) | Mundo procedural, modos dono e treinador, narração lance a lance, base e estádio, visual pixel retrô | Mundo fictício já é padrão; modo dono é ideia aproveitável |

Não confirmados em busca: Makefot, Legend Foot e L-FUT. Ficam fora da análise até a fonte ser verificada.

## Posicionamento e diferenciais

O NOVO mira o quadrante que ninguém ocupa: a leveza do Brasfoot com a profundidade tática moderna, sem pay-to-win.

Mapa de posicionamento (leveza × profundidade, leitura qualitativa):

- Profundo e pesado: Football Manager 26, Openfoot Manager.
- Raso e pesado: Brasfoot, Elifoot.
- Raso e leve: Top Eleven e OSM (pay-to-win), 7a0, BrowserFut.
- Profundo e leve: vazio. É onde o NOVO mira.

**Diferenciais que precisam estar visíveis no MVP**

1. Uma rodada em cerca de 2 minutos, pensada primeiro para o navegador.
2. Motor com tática de custo e benefício, xG e nota por jogador.
3. Ligas assíncronas entre amigos ("a liga da firma").
4. Monetização justa como argumento de marketing.
5. Editor local e banco de dados compartilhável pela comunidade.

**Funcionalidades a incorporar depois do MVP:** categorias de base por idade (Sub-15, Sub-17, Sub-20), modo dono de clube separado do modo treinador, clubes locais (após licenciamento), liga feminina e modo draft por era com elencos fictícios.

## Riscos legais e compliance

O maior risco regulatório é o ECA Digital, em vigor desde 17/03/2026: um manager de futebol é de "acesso provável" por menores e, portanto, não pode ter loot boxes.

**Estratégia do MVP: seguir o modelo do 7a0, menos nos nomes reais.** Grátis, sem cadastro, sem chat, sem compras e sem coleta de dados pessoais. Isso afasta as linhas de loot boxes, chat, pagamentos e dados pessoais da tabela abaixo. O ECA Digital continua valendo, mas com obrigações mínimas; contas, ligas e monetização entram só depois do parecer jurídico.

| Risco | Base | Impacto | Mitigação |
| --- | --- | --- | --- |
| Loot boxes e design manipulativo | [Lei 15.211/2025 (ECA Digital)](https://www.poder360.com.br/poder-governo/eca-digital-entra-em-vigor-nesta-3a-feira-entenda-o-que-muda/), art. 20 | Multa de até 10% do faturamento, limitada a R$ 50 milhões, e possível suspensão ([fonte](https://tecnoblog.net/noticias/eca-digital-entra-em-vigor-para-proteger-menores-na-internet-veja-mudancas/)) | Nenhuma compra com resultado aleatório; sem mecânicas de pressão |
| Chat entre usuários e verificação de idade | ECA Digital ([fonte](https://canaltech.com.br/games/lei-felca-estreia-causando-alvoroco-e-ja-mexe-com-lol-fortnite-e-gta/)) | Ligas multiplayer com interação podem cair na regra | Ligas sem chat livre no início; validar com jurídico antes de abrir interação |
| Nomes reais de clubes e atletas | Direito de imagem e marcas; o FM chegou a ser banido no Brasil em 2017 por licenciamento ([fonte](https://tribunademinas.com.br/colunas/maistendencias/?p=49965)) | Retirada das lojas e ação judicial | Seleções com nomes de países, sem escudos de federações nem nomes reais de jogadores; editor só local |
| Patches da comunidade com nomes reais | Responsabilidade por conteúdo hospedado | Exposição se hospedarmos | Não hospedar nem indexar patches de terceiros |
| Código GPLv3 (Openfoot Manager) | [Licença GPLv3](https://openapps.pro/apps/openfootmanager) | Copiar código obriga abrir todo o produto derivado | Estudar ideias, nunca copiar código |
| Web empacotada nas lojas | Diretriz 4.2 da Apple (funcionalidade mínima) | Rejeição na App Store | Offline, notificações e compras nativas no app |
| Pagamentos nas lojas | Regras de cobrança de Apple e Google | Comissão sobre bens digitais vendidos no app | Preços planejados por canal; Pix ou Stripe só na web |
| Dados pessoais | LGPD + ECA Digital | Sanções da ANPD | Coletar o mínimo; sem perfilamento publicitário de menores |

Recomendação: parecer jurídico sobre ECA Digital e lojas antes do beta aberto.

## Design do motor de partida

Mantemos a base do Elifoot e do Brasfoot (simulação estocástica por eventos, sem física) e corrigimos o que ficou datado.

**1. Duelos por função logística, não por `A > rand(0, B)`.** A comparação linear satura: se o ataque for maior ou igual à defesa, a chance vira 100%, gerando goleadas e quase nenhuma zebra.

```
p = A^k / (A^k + B^k)
```

O expoente k calibra o peso da diferença técnica entre os times.

**2. Cadeia de Markov por zonas.** A posse avança por defesa, meio, último terço e finalização. As transições dependem da força dos setores e da tática. Isso dá fluxo ao jogo e estatísticas de posse coerentes.

**3. Chances com qualidade (xG).** Cada chance nasce com um tipo (contra-ataque, cruzamento, bola parada, pênalti) e um xG base. A conversão é o xG ajustado por finalizador contra goleiro. O pós-jogo mostra xG.

**4. Tática com custo e benefício.** Pressão, altura da linha, ritmo e amplitude, cada uma com um custo (cansaço, espaço nas costas). Estilos se anulam: pressão alta sofre contra bola longa com atacante veloz.

**5. Eventos atribuídos a jogadores.** Quem passou, quem chutou, quem falhou, ponderado por atributo e posição. Gera nota por partida e histórias.

**6. Seed determinística.** Mesma seed + mesmas escalações = mesma partida. Serve para depuração, replay, anti-recarga e ligas online.

**7. Fadiga e mando.** Cansaço acumulado ao longo da temporada; vantagem de mando por clube e estádio (no MVP de seleções, campo neutro).

**Metas de calibração** (simulação Monte Carlo com dezenas de milhares de jogos, comparada a dados reais):

| Métrica | Alvo aproximado |
| --- | --- |
| Gols por jogo | 2,5 a 2,8 |
| Empates | cerca de 25% |
| Vitória do mandante | conforme a liga de referência |
| Tempo por partida simulada | poucos milissegundos |

Os alvos são aproximados e serão fixados com dados reais na fase de calibração.

## Dados históricos das seleções

Força real, elenco fictício: resultados históricos definem quão forte é cada seleção-era, e o gerador cria jogadores com nomes inventados e atributos coerentes com essa força.

| Base | Conteúdo | Uso |
| --- | --- | --- |
| [International results (martj42)](https://github.com/martj42/international_results) | 49.459 resultados entre seleções, de 1872 a 2024, com pênaltis, autores de gol e indicação de campo neutro | Principal: Elo por seleção e por década; média de gols por era como alvo de calibração. Confirmar a licença |
| [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup) | Todas as Copas de 1930 a 2018, 27 datasets; CC-BY-SA 4.0 com atribuição obrigatória | Só pesquisa interna: tem nomes reais e o share-alike pode obrigar a abrir a base derivada |

**Regras do mundo histórico**

1. Seleções-era (ex.: "Brasil anos 70") com força derivada do Elo da década.
2. Jogadores identificados por estilo ("ponta driblador", "camisa 10 cerebral", "líbero clássico"), não por nome real.
3. Nomes gerados por nacionalidade, sem semelhança proposital com jogadores reais.
4. Licenças registradas em docs/DADOS.md.

## Arquitetura técnica

A carreira solo roda inteira no aparelho do jogador; o servidor só cuida de login, backup e ligas multiplayer. É isso que permite volume grande com servidor barato.

Visão geral (o MVP usa só a CDN e o cliente):

- **CDN:** app estático e banco do mundo fictício versionado.
- **Cliente (PWA no navegador ou app Capacitor):**
  - Interface: React ou Svelte; PixiJS para o campo 2D; Three.js só em momentos 3D.
  - Motor em Web Worker: TypeScript puro, determinístico, com seed; simula a carreira solo.
  - Banco local: IndexedDB no MVP, depois SQLite WASM ou nativo; um arquivo por save; funciona offline.
- **Servidor leve (Node + Fastify), após o MVP:**
  - API: login e contas, backup de saves, ligas entre amigos.
  - PostgreSQL: contas e ligas, resultados e seeds, índice dos saves.
  - Fila de rodadas (pg-boss): roda as ligas em lote em horários fixos, usando o mesmo motor.
- **Armazenamento de objetos (S3 ou R2):** saves compactados; o Postgres guarda o índice.

O mesmo pacote do motor roda no Web Worker do cliente e na fila do servidor, o que garante resultados idênticos nas ligas.

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Monorepo | TypeScript (pacotes: motor, cliente, servidor) | Um só motor, testável isoladamente |
| Gráfico 2D | PixiJS (WebGL) | Leve e rápido no celular |
| Momentos 3D | Three.js carregado sob demanda | Não pesa o carregamento inicial |
| Banco local | IndexedDB no MVP; depois SQLite WASM no navegador e nativo no Capacitor | Mesmo esquema nas duas plataformas |
| Backend | Node + Fastify + PostgreSQL | Simples e barato de operar |
| Fila | pg-boss | Dispensa Redis |
| Lojas | PWA primeiro, Capacitor depois | Mesmo código para web, iOS e Android |

**Três regras que mantêm o volume sob controle**

1. Replay por seed: grava-se a seed e as escalações, não o lance a lance.
2. Temporadas antigas compactadas: ficam os totais por temporada; eventos detalhados saem após algumas temporadas.
3. Ligas assíncronas: rodadas processadas em lote em horários fixos, sem partidas em tempo real.

## Modelo de monetização

A monetização é o argumento de marketing: nada que o jogador compre melhora o resultado em campo, e nada tem conteúdo aleatório. O MVP é gratuito e sem compras.

| Fonte de receita | O que entrega | Por que é segura |
| --- | --- | --- |
| Versão premium (compra única) | Ligas extras, mais saves, editor completo | Conteúdo conhecido antes da compra |
| Passe de temporada | Cosméticos (uniformes, escudos, estádio, narração) | Sem vantagem em campo; sem sorteio |
| Ligas privadas premium | Mais participantes e regras customizadas nas ligas entre amigos | Paga o custo de servidor de quem usa multiplayer |
| Anúncios opcionais (só web, só adultos) | Anúncio recompensado por cosmético | Sem perfilamento de menores |

Fora de cogitação: loot boxes, pacotes aleatórios, energia paga e qualquer atalho competitivo.

Preço por canal: compras dentro dos apps passam pelo sistema de Apple e Google, com comissão; na web, Pix ou Stripe.

## Roadmap do MVP

O primeiro passo é o motor calibrado: sem ele, todo o resto se apoia num resultado de partida não confiável. Cinco fases, cada uma liberada por um portão:

1. **Fase 0 · Motor e calibração.** Motor TypeScript com modelo logístico, Markov por zonas e xG; script Monte Carlo comparando com dados reais.
   - Portão: gols por jogo, empates e mando dentro dos alvos de calibração.
2. **Fase 1 · Carreira solo offline.** Seleções-era com força histórica real e elencos fictícios; visualizador 2D com PixiJS; saves locais (IndexedDB, depois SQLite).
   - Portão: uma temporada completa jogável do início ao fim.
3. **Fase 2 · Beta aberto no navegador (Chrome).** Link aberto, sem cadastro, save local exportável; ajustes de UX para sessões curtas.
   - Portão: parecer jurídico (ECA Digital) e feedback do beta.
4. **Fase 3 · Ligas assíncronas entre amigos.** Fila de rodadas no servidor com o mesmo motor; ligas sem chat livre no início.
   - Portão: custo de servidor por liga validado.
5. **Fase 4 · Lojas (Capacitor).** Compras nativas, notificações e modo offline; submissão à App Store e ao Google Play.

As fases não têm datas ainda; os prazos dependem do tamanho do time e serão definidos ao fechar o escopo da Fase 1.

## Decisões em aberto

- [ ] Framework de interface: React ou Svelte.
- [ ] Modo inicial do MVP: só treinador, ou treinador e dono de clube.
- [ ] Escopo do MVP: quantas seleções, quais eras históricas e o que mantém o engajamento entre torneios, já que não há mercado nem finanças.
- [ ] Backup no MVP sem cadastro: apenas exportar e importar o save?
- [ ] Liga de referência para calibração (Brasileirão, Premier League ou média de várias).
- [ ] Preço da versão premium e do passe de temporada por canal.
- [ ] Parecer jurídico sobre ECA Digital, chat e verificação de idade.
- [ ] Nome definitivo do produto e checagem de marca.

## Fontes

- [Sega sobre vendas e críticas do FM26 (SGO)](https://www.sportsgamersonline.com/games/soccer/fm26-sales-are-up-as-sega-aknowledges-user-dissatifaction/)
- [Avaliações do FM26 no Steam (Ingenuity Fantasy)](https://ingenuityfantasy.com/?p=7404)
- [Brasfoot sem atualizações desde 2023 (Tribuna de Minas)](https://tribunademinas.com.br/colunas/maistendencias/?p=49965)
- [Brasfoot libera registro grátis (TecMundo)](https://www.tecmundo.com.br/voxel/502903-brasfoot-libera-registro-gratis-veja-como-baixar-e-jogar-atualmente.htm)
- [Top Eleven na App Store](https://apps.apple.com/app/id459035295)
- [Avaliações do Top Eleven (Trustpilot)](https://nl-be.trustpilot.com/review/topeleven.com)
- [Online Soccer Manager (AppGoblin)](https://appgoblin.info/apps/400201466)
- [7a0 (O Povo)](https://www.opovo.com.br/esportes/futebol/copa-do-mundo/2026/06/08/7-a-0-veja-o-que-e-o-jogo-da-copa-do-mundo-que-tem-viralizado.html)
- [BrowserFut (Critical Hits)](https://criticalhits.com.br/games/browserfoot-manager-de-futebol-pelo-navegador-e-lancado/)
- [Openfoot Manager (DeepWiki)](https://deepwiki.com/openfootmanager/openfootmanager)
- [Openfoot Manager e GPLv3 (OpenApps)](https://openapps.pro/apps/openfootmanager)
- [A Lenda do Futebol (itch.io)](https://itch.io/profile/lazymugstudio)
- [ECA Digital em vigor (Poder360)](https://www.poder360.com.br/poder-governo/eca-digital-entra-em-vigor-nesta-3a-feira-entenda-o-que-muda/)
- [ECA Digital: sanções (Tecnoblog)](https://tecnoblog.net/noticias/eca-digital-entra-em-vigor-para-proteger-menores-na-internet-veja-mudancas/)
- [ECA Digital e jogos (Canaltech)](https://canaltech.com.br/games/lei-felca-estreia-causando-alvoroco-e-ja-mexe-com-lol-fortnite-e-gta/)
- [International results (martj42, GitHub)](https://github.com/martj42/international_results)
- [Fjelstul World Cup Database (GitHub)](https://github.com/jfjelstul/worldcup)
