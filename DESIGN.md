---
name: Garimppu
description: Ofertas e criativos escalados na Biblioteca de Anúncios da Meta, ranqueados por sinais de escala.
colors:
  mine-black: "#0c0d0f"
  shaft-slate: "#15171a"
  ledge-slate: "#1d2024"
  seam-line: "#2a2e33"
  quartz-white: "#e8e6e1"
  dust-gray: "#8d9096"
  lantern-amber: "#f2a93b"
  ore-ink: "#1a1206"
  ember: "#ff6b3d"
  vein-green: "#5cc98b"
  alarm-red: "#f06363"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  section:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.56
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.05em"
  metric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "tnum"
  micro:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button:
    backgroundColor: "{colors.ledge-slate}"
    textColor: "{colors.quartz-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.lantern-amber}"
    textColor: "{colors.ore-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dust-gray}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  field:
    backgroundColor: "{colors.ledge-slate}"
    textColor: "{colors.quartz-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.shaft-slate}"
    rounded: "{rounded.lg}"
    padding: "12px"
  panel:
    backgroundColor: "{colors.shaft-slate}"
    rounded: "{rounded.lg}"
    padding: "16px"
  score-badge-hot:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.ore-ink}"
    typography: "{typography.metric}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  score-badge-warm:
    backgroundColor: "{colors.lantern-amber}"
    textColor: "{colors.ore-ink}"
    typography: "{typography.metric}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  score-badge-cold:
    backgroundColor: "{colors.ledge-slate}"
    textColor: "{colors.quartz-white}"
    typography: "{typography.metric}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  chip:
    backgroundColor: "{colors.ledge-slate}"
    textColor: "{colors.dust-gray}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  chip-platform:
    backgroundColor: "transparent"
    textColor: "{colors.lantern-amber}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-item-active:
    backgroundColor: "{colors.ledge-slate}"
    textColor: "{colors.quartz-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.dust-gray}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Garimppu

## Overview

**Creative North Star: "A Lanterna do Garimpeiro"**

O painel é o escuro de uma mina: superfícies quase pretas em camadas de ardósia, texto claro e quieto, e uma única luz âmbar que só acende onde há ouro. Tudo o que não é sinal recua para o cinza; o que é sinal (um score alto, um botão de ação, uma oferta com vários anunciantes) recebe a lanterna. A urgência vem da escassez dessa luz, não de volume, animação ou cor espalhada.

É uma ferramenta de trabalho densa e rápida de escanear: listas e grades ranqueadas, números em fonte mono tabular, rótulos curtos em caixa alta. A precisão vem dos números alinhados e das métricas sempre com legenda; a calma vem da paleta contida, da ausência de sombras e de bordas finas de um pixel. Nada de "painel de guru" (neon, gradientes, promessas de dinheiro), nada de SaaS genérico claro em roxo e azul, e nada da estética de espião ou hacker (verde matrix, lupas, caveiras).

**Key Characteristics:**
- Tema escuro único, sem modo claro.
- Uma cor de destaque (âmbar), usada só para ação primária, estado ativo e sinal forte.
- Números em Geist Mono tabular; texto em Geist.
- Profundidade por camadas tonais e bordas de 1px, não por sombras.
- Densidade alta, cantos levemente arredondados, tipografia pequena e firme.

## Colors

Uma paleta de mina: ardósias quase pretas, um branco de quartzo quente e uma luz âmbar, com brasa, verde e vermelho reservados para estados.

### Primary
- **Lantern Amber** (lantern-amber): a luz do garimpeiro. Botão primário, borda de campo em foco, links de destaque, marca da navegação, valores de métrica acima do limiar ("forte"), selo de plataforma de checkout, checkboxes. Sempre com **Ore Ink** como texto quando é fundo.
- **Ore Ink** (ore-ink): texto sobre âmbar. Nunca usado sozinho.

### Secondary
- **Ember** (ember): brasa. Só no selo de score mais quente (score de escala ≥ 3), com texto branco. É o único laranja-avermelhado do sistema e marca "isso está pegando fogo".

### Neutral
- **Mine Black** (mine-black): fundo da página e da navegação fixa.
- **Shaft Slate** (shaft-slate): primeira camada: cartões, painéis de filtro, menus suspensos.
- **Ledge Slate** (ledge-slate): segunda camada: campos, botões secundários, chips, fundo de mídia, item de navegação ativo.
- **Seam Line** (seam-line): bordas de 1px e a "grade" das faixas de métricas (o fundo que aparece no gap de 1px).
- **Quartz White** (quartz-white): texto principal e números.
- **Dust Gray** (dust-gray): texto secundário, rótulos, legendas, ícones em repouso, placeholders (a 70%).

### Estados
- **Vein Green** (vein-green): concluído/sucesso (status de coleta "Concluída").
- **Alarm Red** (alarm-red): erro, crescimento negativo, ação destrutiva no hover. Fundos de alerta usam a cor a 10–15% com borda a 40%.

### Named Rules
**The One Lantern Rule.** O âmbar é a única luz da tela. Se tudo brilha, nada é ouro: âmbar só em ação primária, foco, estado ativo e valor acima do limiar.

**The Signal Threshold Rule.** Uma métrica só fica âmbar quando está no topo do resultado que o usuário está vendo: anúncios e dias ativo no top 10% do conjunto filtrado (com pisos de 2 anúncios e 7 dias), calculados no backend sobre o conjunto inteiro, não só a página carregada. Limiares absolutos só valem quando o número tem significado próprio (anunciantes ≥ 2). Abaixo disso, fica em Quartz White; conjuntos pequenos demais para ranquear não acendem nada.

## Typography

**Display/Body Font:** Geist (com system-ui, sans-serif)
**Label/Mono Font:** Geist Mono (com ui-monospace, monospace)

**Character:** Geist é neutra e técnica, sem personalidade decorativa; Geist Mono dá aos números o peso de leitura de instrumento. O par soa como um laudo, não como marketing.

### Hierarchy
- **Headline** (600, 1.5rem, tracking -0.025em): título da página ("Ofertas mais escaladas", "Criativos mais escalados"; no detalhe do criativo, o nome do anunciante). Um `h1` por tela.
- **Section** (600, 1.125rem): títulos de seção dentro da tela ("Ofertas em alta", "Anúncios com este criativo").
- **Title** (500, 1rem; 0.875rem nos cartões): nome da oferta e do anunciante.
- **Body** (400, 0.875rem): texto de interface. Subtítulos de página ficam em até 65 caracteres por linha (`max-w-prose`) com entrelinha 1.625; copy de anúncio nos cartões usa entrelinha 1.5 (texto claro sobre escuro pede mais ar). No detalhe do criativo, a copy é o conteúdo e fica em Quartz White, não em Dust Gray.
- **Label** (500, 0.75rem, caixa alta, tracking 0.05em): rótulos de campo, cabeçalhos de tabela e legendas das estatísticas do detalhe, em Dust Gray.
- **Metric** (Geist Mono 400, 0.875rem, numerais tabulares): todos os números (scores, contagens, dias, crescimento, ranking "#1"). No detalhe do criativo, 1.25rem: abaixo do título, nunca competindo com ele.
- **Micro** (0.6875rem = 11px, token `text-micro`): o menor tamanho do sistema; nada fica abaixo dele. A classe `.micro` (caixa alta, tracking 0.05em, Dust Gray) é a legenda sob números nas faixas de métricas; chips, siglas de plataforma e selos sobre a mídia usam `text-micro` sem caixa alta. Onde a célula é estreita (linhas de oferta abaixo de 1280px), a legenda perde o tracking em vez de ser cortada.

Títulos (`h1`–`h3`) usam `text-wrap: balance` e parágrafos usam `text-wrap: pretty`, definidos globalmente. A seleção de texto é Dust Gray a 40% e o cursor de digitação é Lantern Amber (estado de foco).

### Named Rules
**The Numbers Are Mono Rule.** Todo número que o usuário compara (score, contagem, dias, crescimento, posição) é Geist Mono tabular, para que colunas alinhem e a leitura seja de instrumento.

## Layout

Contêiner central com largura máxima de 1600px, margens laterais de 16px (24px a partir de 640px) e 24px no topo. A navegação é uma faixa fixa de 56px no topo.

As telas seguem um ritmo vertical fixo: cabeçalho da página (título e uma linha de explicação), painel de filtros, contador de resultados com ação secundária (ex.: "Exportar CSV") e, por fim, os resultados. O espaçamento entre esses blocos é de 24px; dentro dos painéis é de 12px.

Marcas grandes (páginas com 2 mi+ curtidas ou de marcas conhecidas, como Boticário, 99 e Amazon) ficam fora do ranking por padrão, porque afiliados não podem promovê-las. Ao lado de "Somente ativos" há a caixa "Incluir marcas grandes"; abaixo da legenda do score, uma linha diz quantos resultados ficaram de fora e por quê, com "Mostrar mesmo assim". Quando incluídas, os cartões e as linhas dessas páginas trazem a etiqueta neutra "Marca grande" (borda Seam Line, sem âmbar) antes do nicho. Anunciante, coleção e oferta abertos diretamente mostram tudo. No Explorar, o painel de filtros fica recolhido numa linha (busca, botão "Filtros" com a contagem em âmbar, "Somente ativos" e "Incluir marcas grandes"); abaixo dela, os filtros ativos aparecem como chips removíveis e "Limpar filtros". O botão abre uma grade de 2 colunas (5 a partir de 768px) com Busca, Nicho, Mídia e os mínimos. "Ordenar por" fica no cabeçalho dos resultados, ao lado do contador, em todos os tamanhos, junto com a alternância Grade/Lista compacta e "Exportar CSV". Ofertas segue o mesmo padrão (painel com Tipo, Plataforma, Busca e Mín. anunciantes; "Ordenar por" ao lado do contador). A linha de oferta muda por largura: no celular, as 4 miniaturas ocupam a largura em quadrados iguais, com nome, faixa de métricas (2×2 abaixo de 400px) e a linha score + "Ver criativos" empilhados; de 640px a 1279px, as miniaturas (64px, 80px a partir de 1024px) ficam à esquerda e o resto numa coluna à direita; a partir de 1280px, três colunas. Em Minerar, abaixo de 1024px cada busca é um cartão com rótulos em Label (Status, Criativos, Última coleta, Recoleta) e as ações embaixo; a partir de 1024px, a tabela. No detalhe do criativo, abaixo de 640px a tabela de anúncios vira lista (ID, data, cópias, status e o texto embaixo) e a 5ª métrica ocupa a linha inteira. Botões compactos (`h-7`/`h-8`) sobem para 44px com ponteiro grosso. As peças são compartilhadas (`FilterToggle`, `FilterChips`, `FilterSelect`, `SortSelect`). A tecla "/" leva à busca da página; um "/" em caixa aparece dentro do campo vazio só com ponteiro fino a partir de 768px. O subtítulo do Explorar termina com "Última coleta há N h" (da busca filtrada, ou da mais recente). Os criativos aparecem numa grade automática de cartões com largura mínima de 250px e 16px de gap, ou na lista compacta: linhas de ~80px com posição, miniatura de 64px, anunciante, nicho e plataformas, faixa de métricas (a partir de 768px), selo de score e coleções. A escolha fica salva no navegador. As ofertas são linhas que quebram: miniaturas, informação flexível (mínimo de 256px) e métricas alinhadas à direita, que descem para baixo em telas estreitas. Os detalhes usam duas colunas a partir de 1024px (mídia com até 460px e informação).

## Elevation & Depth

O sistema é plano. A profundidade vem de camadas tonais (Mine Black → Shaft Slate → Ledge Slate) e de bordas Seam Line de 1px. A única sombra é a de menus suspensos (seletor de coleções), que flutuam sobre o conteúdo. A navegação fixa usa o fundo a 90% com desfoque, em vez de sombra.

### Named Rules
**The Flat Mine Rule.** Superfícies não flutuam. Para separar, suba uma camada de ardósia ou use uma borda de 1px; sombra só para o que literalmente sobrepõe a página (menus, popovers).

## Shapes

Cantos levemente arredondados e consistentes: 4px em selos de score e badges de ranking, 6px em botões, campos e itens de navegação, 8px em cartões, painéis e faixas de métricas, e pílula em chips de categoria e plataforma. Avatares de anunciante são círculos. Mídia (imagens e vídeos dos criativos) é recortada dentro do cartão, quadrada nas grades e com 80px nas linhas de oferta. As faixas de métricas usam um gap de 1px sobre fundo Seam Line para desenhar divisórias finas sem bordas individuais.

## Components

### Buttons
Firmes e discretos; a ação primária é a única com luz.
- **Shape:** cantos de 6px, altura de 36px (32px nas ações compactas de cartão), padding horizontal de 12px.
- **Primary:** fundo Lantern Amber, texto Ore Ink, peso 500. É uma por região ("Minerar agora", "Minerar esta página"). Os painéis de filtro não têm botão primário: os filtros se aplicam sozinhos.
- **Default:** fundo Ledge Slate, borda Seam Line, texto Quartz White; no hover, a borda passa a Dust Gray.
- **Ghost:** transparente e sem borda, texto Dust Gray; no hover, ganha fundo Ledge Slate. Usado em ações de cartão ("Biblioteca", "Página") e em "Limpar filtros".
- **Disabled:** 50% de opacidade e cursor bloqueado. O primário também fica com brilho a 110% no hover. "Exportar CSV" fica desativado enquanto carrega e quando o resultado é vazio.

### Chips
- **Category chip:** pílula Ledge Slate com texto Dust Gray a 11px (nicho, tipo de oferta).
- **Platform chip:** pílula com borda âmbar a 40% e texto âmbar, para a plataforma de venda (Hotmart, Kiwify, Google Play).
- **Filter chip:** o mesmo formato com um "×" para remover (ex.: "Oferta: …" no Explorar).
- **Platform code:** retângulo de 4px com borda Seam Line, Geist Mono a 11px. No máximo dois por criativo (Facebook e Instagram primeiro) e "+N" para o resto; a lista completa fica no nome acessível e no title.
- **Card meta line:** abaixo do nome do anunciante, que ocupa a largura toda, vem o nicho em Dust Gray 12px seguido das siglas de plataforma.

### Capa de reserva
Quando a imagem falha ou é um quadro preto (amostra de 8×8 com brilho máximo < 16, só em mídia servida pelo backend), um vídeo mostra um círculo com play sobre Ledge Slate e as primeiras palavras do anúncio; nas miniaturas, só o play. Imagens sem capa mostram o texto do anúncio.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Shaft Slate; a mídia fica sobre Ledge Slate.
- **Shadow Strategy:** nenhuma (veja Elevation & Depth).
- **Border:** Seam Line; no hover, o cartão de criativo clareia a borda para Dust Gray a 60% e a mídia cresce 2%.
- **Internal Padding:** 12px nos cartões, 16px nos painéis de filtro.

### Inputs / Fields
- **Style:** altura de 36px, fundo Ledge Slate, borda Seam Line de 1px, cantos de 6px, texto de 14px, placeholder Dust Gray a 70%.
- **Focus:** a borda vira Lantern Amber, sem glow; com teclado, ganha também o anel de foco.
- **Placeholder:** Dust Gray pleno (5:1 sobre Ledge Slate).

### Focus Ring
Todo elemento interativo (links, botões, campos, selects, caixas) mostra, só em foco por teclado (`:focus-visible`), um contorno Lantern Amber de 2px afastado 2px. Campos usam afastamento de 1px; elementos encostados numa borda que corta (mídia do cartão, itens de Ofertas em alta) desenham o anel para dentro (-2px). É o único uso do âmbar que não sinaliza ação primária ou limiar: estado ativo de foco.
- **Labels:** sempre acima, no estilo Label (caixa alta, Dust Gray).

### Navigation
Uma faixa fixa de 56px sobre Mine Black a 90%, com desfoque e borda inferior Seam Line. A marca é um quadrado âmbar de 28px com a inicial em Geist Mono negrito, o nome em 600 e uma descrição em Dust Gray (só a partir de 768px). Abaixo de 640px, os itens descem para uma segunda linha com quatro abas de largura igual. Os itens usam texto de 14px: o ativo tem fundo Ledge Slate e texto Quartz White; os inativos têm texto Dust Gray, que clareia no hover.

### Score Badge (signature)
Um selo Geist Mono de 12px com cantos de 4px, que funciona como termômetro de escala:
- **Hot:** Ember com texto Ore Ink (6,5:1), top 5% do resultado atual.
- **Warm:** Lantern Amber com Ore Ink, top 20% do resultado atual.
- **Cold:** Ledge Slate com Quartz White, o resto.

Os cortes são relativos ao conjunto filtrado (criativos ou ofertas) e vêm da API em `heat`; no detalhe do criativo, a referência é a base de criativos ativos. O Ember só aparece a partir de 20 itens e o âmbar a partir de 5. Os selos sobre a mídia (posição "#1", "vídeo") usam Mine Black a 85% com borda Seam Line e texto Quartz White.

### Metric Strip (signature)
Uma faixa de 3 a 5 células iguais, com divisórias de 1px desenhadas pelo gap sobre fundo Seam Line e cantos externos de 8px. No código, o rótulo (`dt`) vem antes do valor (`dd`), e `flex-col-reverse` mantém o valor em cima. Cada célula tem o valor em Metric (âmbar se passa do limiar, Alarm Red se negativo) e a legenda em Micro, na cor Dust Gray. Ela aparece nos cartões de criativo (anúncios, dias, crescimento), nas linhas de oferta (anunciantes, anúncios, criativos, dias) e no detalhe do criativo.

### Offer Line (cartão de criativo)
Logo abaixo da faixa de métricas: um chip neutro (borda Seam Line, texto Quartz White, 11px) com a plataforma de venda ou o tipo de oferta, seguido do nome curto em Dust Gray. A linha inteira leva aos criativos daquela oferta. O chip é neutro de propósito: âmbar em todos os cartões quebraria The One Lantern Rule.

### Hot Offers Strip (Ofertas em alta)
Faixa com as 5 ofertas de maior score entre a área de filtros e a grade, seguindo a busca e o texto filtrados e excluindo WhatsApp/perfil. Cada item: miniatura de 48px, nome, selo de score relativo, plataforma ou tipo e "N anunciantes · N anúncios" (anunciantes em âmbar a partir de 2). Em 5 colunas no desktop, 3 no tablet e rolagem horizontal com snap no celular. Some quando há filtro de oferta.

### Filtros (um modelo só)
Todo filtro vive na URL e se aplica sozinho: selects e caixas na hora, campos digitados (texto e mínimos numéricos) 400ms depois da última tecla. Enter aplica tudo o que foi digitado sem esperar. Campos numéricos aceitam só dígitos. Durante a recarga, a lista anterior fica a 60% de opacidade, com `aria-busy`, e uma região `role="status"` oculta anuncia "Carregando…" e depois "N criativos encontrados" (ou "Nenhum…").

### Confirmação de mineração
Minerar consulta a Biblioteca da Meta por minutos, então nunca é um clique só. O botão primário abre, no próprio lugar, um painel Shaft Slate com o que vai acontecer (escopo, até 300 anúncios, segundo plano, onde acompanhar) e os botões "Minerar agora" (primário, recebe o foco) e "Cancelar" (ghost). Escape cancela e devolve o foco ao botão original. Usado no estado vazio do Explorar e na página do anunciante.

### Métrica sem histórico
Enquanto um criativo só foi visto num dia de coleta, a célula de crescimento mostra "—" com a legenda "1ª coleta", e a ordenação por crescimento fica oculta.

### Status Pill
Um rótulo de 4px a 12px em peso 500, com no mínimo 24px de altura, fundo da cor de estado a 15% e texto na cor de estado: "Na fila" (neutro), "Coletando" (âmbar, com um ponto desenhado que pulsa só sem reduced-motion), "Concluída" (verde) e "Erro" (vermelho). Clicar no rótulo abre e fecha o log da coleta (`aria-expanded`).

### Back Link
`BackLink`: seta SVG de 16px (traço 2) e texto de 14px em Dust Gray, que clareia no hover. Ocupa só a largura do texto, nunca a linha inteira. Usado no detalhe do criativo, no anunciante, na coleção e nos criativos de uma oferta. Setas e ícones são sempre SVG, nunca caracteres como "←" ou "→".

### Empty State
Uma caixa com borda tracejada Seam Line, 64px de padding vertical e texto Dust Gray centralizado. Ela diz por que está vazia e oferece o próximo passo, como um link âmbar para "Minerar" ou um botão primário "Minerar …".

## Do's and Don'ts

### Do:
- **Do** reservar Lantern Amber para a ação primária, o foco, o estado ativo e os valores acima do limiar (The One Lantern Rule).
- **Do** escrever todo número comparável em Geist Mono tabular, com legenda em Micro logo abaixo.
- **Do** separar superfícies com camadas de ardósia e bordas Seam Line de 1px.
- **Do** mostrar por que algo ranqueia (anunciantes, anúncios, dias, crescimento) ao lado do score.
- **Do** dar a todo estado vazio uma explicação e um próximo passo.

### Don't:
- **Don't** usar neon, gradientes ou linguagem de "painel de guru" com promessas de dinheiro.
- **Don't** adotar o visual de SaaS genérico claro em roxo e azul.
- **Don't** usar estética de espião ou hacker (verde matrix, lupas, caveiras).
- **Don't** colocar sombras em cartões ou painéis; sombra é só para menus que sobrepõem a página.
- **Don't** introduzir uma segunda cor de destaque; Ember existe só no selo de score mais quente.
