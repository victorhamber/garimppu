# Garimppu - Ofertas e criativos escalados na Meta

Coleta anúncios ativos da Biblioteca de Anúncios da Meta por tema, palavra-chave ou nicho,
agrupa criativos repetidos e ranqueia os mais escalados.

## Como o ranking funciona

A Biblioteca não mostra gasto nem resultado de anúncios comerciais no Brasil, então o score usa sinais indiretos:

| Sinal | Como é medido |
| --- | --- |
| Duplicação | Quantos anúncios ativos usam o mesmo criativo (inclui o agrupamento "X anúncios usam este criativo" da Meta + dedupe por hash perceptual da imagem/thumbnail ou do texto) |
| Longevidade | Dias desde o início da veiculação (satura em 90) |
| Plataformas | Facebook, Instagram, Messenger, Audience Network, Threads, WhatsApp |
| Crescimento 7d | Variação de anúncios ativos entre coletas (precisa de recoleta automática) |
| Anunciante | Total de anúncios ativos da página |

```
score = w1*log(1+duplicatas) + w2*min(dias,90)/90 + w3*plataformas/6 + w4*crescimento_7d + w5*log(1+ads_pagina)/log(501)
```

Os pesos ficam em `backend/.env` (`SCORE_W_*`).

## Rodando localmente (Windows, sem Docker)

Usa SQLite (`backend/data/miner.db`) e executa as coletas numa thread do próprio backend.
Produção usa Postgres: basta definir `DATABASE_URL` (veja [DEPLOY.md](DEPLOY.md)); as migrações valem para os dois.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m playwright install chromium
copy .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.create_admin seu@email.com --senha-provisoria
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000

# Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

Abra http://localhost:3000, entre com o e-mail e a senha provisória, vá em **Minerar**, crie uma busca e acompanhe o status. Os criativos aparecem em **Explorar**. Licenças, webhook de compra e e-mail ficam em **Licenças** (menu da conta).

Use `python -m uvicorn` / `python -m alembic` em vez dos executáveis da venv caso o Windows bloqueie os `.exe`.

## Rodando com Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
docker compose exec api python -m app.create_admin seu@email.com --senha-provisoria
```

Sobe o Postgres, a API (mídia no volume `garimppu-data`, coletas e agendador no mesmo processo) e o painel em http://localhost:3000.
Para levar os dados do SQLite local: copie o `miner.db` para o volume e rode `docker compose exec api python -m app.import_sqlite data/miner.db` antes de criar o admin.

## Deploy no EasyPanel

Passo a passo em [DEPLOY.md](DEPLOY.md).

## Fontes de dados

- **Scraping** (padrão no modo híbrido): abre a Biblioteca pública com Playwright e intercepta as respostas GraphQL internas. Cobre anúncios comerciais do Brasil. Toda a lógica de parsing está em `backend/app/collectors/library_scraper.py`; se a Meta mudar o formato, é o único arquivo a ajustar.
- **API oficial** (`ads_archive`): preencha `META_ACCESS_TOKEN` no `.env` (token de app com identidade verificada na Biblioteca de Anúncios). Para anúncios comerciais ela só retorna dados de veiculações na UE, então complementa o scraping.

Use aspas na busca para frase exata: `"secar barriga"`.

Para acompanhar um anunciante específico, crie a busca com **Buscar por: Página** e cole o link da página na Biblioteca
(o que contém `view_all_page_id=...`), um link `profile.php?id=...` ou o ID numérico. A coleta traz todos os anúncios
ativos daquela página. Na tela de um anunciante também há o botão **Minerar esta página**.

## Ofertas

A aba **Ofertas** agrupa os anúncios pelo destino do link para mostrar produtos escalados, não só criativos:

| Tipo | Como agrupa |
| --- | --- |
| Infoproduto | código do produto no checkout (Hotmart, Kiwify, Eduzz, Monetizze, Braip, PerfectPay, Ticto...) |
| Loja | produto (`/products/...`, Mercado Livre, Shopee, Amazon por ASIN) ou loja Shopify/Yampi/Cartpanda/Nuvemshop |
| App | ID do app na Google Play / App Store |
| WhatsApp / perfil | a própria página (links de conversa não identificam produto) ou o @ do Instagram |
| Site | domínio |

```
score_oferta = 2.5*log(anunciantes) + log(1+anúncios) + 0.5*log(1+criativos) + min(dias,90)/90
             + 0.75 por plataforma extra (TikTok Top Ads, vídeos do YouTube, ranking de sites)
```

Várias páginas na mesma oferta pesa mais: afiliados e revendedores só entram em massa no que converte.
Uma oferta do Meta que também aparece nos top anúncios do TikTok ou em vídeos do YouTube ganha o selo das
plataformas (ex.: "Meta + TikTok"); se o site dela está num ranking de sites coletado, ganha o selo "Site #N".
Os dois casos dão o bônus no score, entram no filtro "Também no TikTok, YouTube ou ranking de sites" e na
ordenação "Em mais plataformas".
As regras ficam em `backend/app/pipeline/offers.py`; depois de alterá-las rode `python -m app.reclassify_offers`.

## Vídeos (YouTube)

Em **Minerar**, *Buscar por: YouTube* coleta pela YouTube Data API v3 (precisa de `YOUTUBE_API_KEY`) os vídeos
orgânicos mais vistos dos últimos 30 dias para o termo, país e idioma. A aba **Vídeos** ordena por:

```
score_video = log10(1 + views/dia)
            + log10(1 + views/inscritos do canal)        # vídeo fora da curva para o tamanho do canal
            + 0.5*min(engajamento/5%, 1.5)               # engajamento = (curtidas + 2*comentários)/views
            + bônus de aceleração (views/dia recentes ÷ média, entre -0.5 e +1)
```

Sem tema, escolhendo um nicho, a busca usa os termos do nicho (`NICHE_QUERIES` em `collectors/youtube.py`).
Lives e vídeos em outro idioma (o padrão é o idioma do país) são descartados, e cada busca mostra só os vídeos da
última coleta. Cada vídeo recebe um nicho pelo mesmo classificador dos anúncios.
A aceleração aparece a partir da segunda coleta (snapshot diário de views). O link de checkout/loja/app mais
comercial da descrição é classificado como oferta, igual aos anúncios, e a oferta mostra quantos vídeos a citam.
Código: `backend/app/collectors/youtube.py`, `backend/app/pipeline/video_score.py` e `video_ingest.py`.

## TikTok (Top Ads)

Em **Minerar**, *Buscar por: TikTok Ads* coleta os "Top Ads" do TikTok Creative Center (anúncios de leilão que o
TikTok aponta como os de melhor desempenho) dos últimos 180 dias, por país, idioma e nicho (setor do anunciante).
Não há busca por palavra-chave nem vídeos orgânicos em alta para o Brasil no Creative Center. Cada coleta pega metade
pelos melhores CTRs do nicho e metade pelos mais curtidos (o TikTok limita cada lista a 500). Comentários,
compartilhamentos e página de destino vêm do detalhe de cada anúncio, buscado só uma vez. A aba **TikTok** ordena por:

```
score_tiktok = 3*(1 - percentil do CTR no nicho)          # top 1% -> ~3
             + 0.5*log10(1 + curtidas)
             + 0.5*log10(1 + comentários + 2*compartilhamentos)
             + 0.25*faixa de verba (0 baixa, 1 média, 2 alta)
```

O Creative Center não tem API pública: uma visita com o Playwright captura a assinatura de sessão da própria página e
as consultas seguem por HTTP, com pausa entre requisições. A página de destino vira oferta, igual aos anúncios da Meta.
Código: `backend/app/collectors/tiktok_ads.py` e `backend/app/pipeline/tiktok_ingest.py`.

## Sites de venda

A aba **Sites** lista os sites próprios dos anunciantes (lojas e páginas de venda) para onde apontam os anúncios do
Meta já coletados, agrupados por domínio: anunciantes, anúncios, produtos, dias no ar, nicho (o mais comum entre os
criativos) e se o mesmo site aparece em top anúncios do TikTok ou em vídeos do YouTube. Checkouts (Hotmart, Kiwify...),
marketplaces, apps, WhatsApp e encurtadores ficam de fora. O score é o mesmo das ofertas, somando o site inteiro.
Código: `backend/app/routes/sites.py`.

O ranking do Cloudflare Radar (`collectors/radar.py`) não é mais criado em Minerar: o filtro de categoria do Radar só
olha os 100 domínios mais acessados do país, dominados por Google, Facebook e afins.

## Palavras-chave em alta (Google Trends)

Em **Minerar**, *Buscar por: Palavras-chave em alta* acompanha o feed RSS oficial e público do Google Trends
(`trends.google.com/trending/rss?geo=BR`), sem chave. O feed só mostra os ~10 termos das últimas horas, então essas
buscas são recoletadas sozinhas **a cada hora** (`TRENDS_REFRESH_HOURS`, fora do limite de coletas do Meta) e o
histórico se acumula: cada termo guarda o volume estimado pelo Google (ex.: 20 mil+), o pico, os dias em que ficou em
alta e as notícias ligadas a ele. O nicho é detectado pelo mesmo classificador dos anúncios, a partir do termo e das
manchetes; o nicho escolhido na busca funciona como filtro. A aba **Palavras-chave** lista os termos com links para o
Google Trends, para a busca no Google e para o Explorar, a contagem de anúncios do Meta já coletados que citam o termo
e um botão que cria a busca do termo no Meta.
Código: `backend/app/collectors/google_trends.py`, `backend/app/pipeline/trends_ingest.py` e
`backend/app/routes/keywords.py`.

No topo da aba **Palavras-chave** dá para pesquisar qualquer palavra: `GET /api/keywords/suggest?term=&country=`
expande o termo no autocompletar público do Google (termo puro, termo + letras, "como/qual/melhor..." + termo, cerca
de 30 consultas sequenciais, com cache de 24 h) e ordena as buscas pela frequência e posição em que o Google as sugere.
A popularidade é relativa (100 = a mais sugerida da pesquisa), não é volume real. Código:
`backend/app/collectors/google_suggest.py`.

## Recoleta e crescimento

Buscas com recoleta automática são reexecutadas pelo agendador (a cada 15 min ele verifica o que está vencido). Toda coleta grava um snapshot diário por criativo, que alimenta o crescimento de 7 dias. Diariamente às 03:00 UTC todos os scores são recalculados.

## Estrutura

```
backend/app/
  collectors/      scraper Playwright e API oficial -> RawAd
  pipeline/        normalização, mídia, dedupe, nicho, score, ingestão
  routes/          endpoints FastAPI (/api/searches, /api/creatives, /api/collections...)
  tasks.py         execução de uma busca
  jobs.py          fila (RQ com Redis, ou thread local)
  scheduler.py     recoleta periódica
frontend/          painel Next.js
```

## Cuidados

- Scraping automatizado pode violar os termos de uso da Meta. Use com moderação: há atraso aleatório entre rolagens, limite de anúncios por busca e nenhum login.
- As URLs de mídia da Meta expiram; imagens e thumbnails são baixados em `backend/data/media`. Vídeos só são baixados com `DOWNLOAD_VIDEOS=true`.
