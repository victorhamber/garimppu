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
```

Várias páginas na mesma oferta pesa mais: afiliados e revendedores só entram em massa no que converte.
As regras ficam em `backend/app/pipeline/offers.py`; depois de alterá-las rode `python -m app.reclassify_offers`.

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
