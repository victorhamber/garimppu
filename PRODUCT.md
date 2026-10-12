# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users, once sold:

- **Infoprodutores e coprodutores** looking for validated offers, angles and creatives to model before launching or scaling a product.
- **Afiliados de infoproduto** (Hotmart, Kiwify, Eduzz...) deciding which product to promote and which creatives already convert.
- **Gestores de tráfego e agências** researching a client's niche and competitors and tracking specific advertisers over time.
- **Lojistas de e-commerce / dropshipping** looking for physical products that several stores are scaling at once.

Today the product is used personally by its owner; commercial users are the target audience going forward. All users work in Brazilian Portuguese and mostly target the Brazilian market (country BR).

The job: "find what is scaling right now, before everyone else, and understand it well enough to model it."

## Product Purpose

Garimppu collects active ads from Meta's public Ad Library by keyword, by Facebook page, or by recurring re-collection; groups repeated creatives; and ranks both **creatives** and **offers** by indirect scaling signals. Success means the user leaves with a short list of offers and creatives worth modeling, with enough evidence (advertisers, ad counts, longevity, growth) to trust the choice.

## Positioning

Two things neighboring tools (Spy Ads, MinerAI, Escalonador, AdEscala, Fusion Ads, AdSniper, Digispy) do not lead with:

1. **Offers, not just creatives.** Ads are grouped by what they sell (checkout product code, store product, app, site). Many different advertisers on the same offer is the primary scaling signal, because affiliates and resellers only pile into offers that convert.
2. **Own collection with history.** Every collection snapshots each creative, so growth over 7 days and an advertiser's trajectory come from the product's own time series, not a one-off look at the Ad Library.

## Operating Context

- Workflow: create a search in **Minerar** (keyword, exact phrase in quotes, or a page via its Ad Library link / page ID) → collection runs in the background with a visible log → review **Ofertas** (ranked offers) and **Explorar** (ranked creatives) → open an advertiser or creative detail → save to **Coleções** → export CSV.
- Searches can re-collect automatically (daily to weekly; once a day is the ceiling, enough for daily snapshots and 7-day growth); a scheduler rescans due searches and rescores daily.
- **Shared collection.** A search is a subscription to a *source*: one canonical Ad Library query (keyword or page, country, language, media type). Identical searches by different users share the source, its runs and its history, so a new subscriber to an already monitored term sees its creatives immediately with no new collection ("já era monitorada desde..."). The source collects at the most frequent refresh among its active subscribers (never more than once a day) and up to the largest cap. Subscribers never see each other.
- Niches are always detected by the classifier; the niche chosen on a search only filters what that subscriber sees.
- **Accounts and licenses.** Only users with a license get in: e-mail + password, session in an httpOnly cookie (30 days). A license is simply active or blocked, with an optional expiry date; no plans. Licenses are granted manually in **/admin** (admins only, same app) or automatically by the purchase webhook (Hotmart, Kiwify, Cakto): approved purchase grants or renews, refund/chargeback/cancellation blocks. New customers get a temporary password by e-mail (SMTP) or, without SMTP, shown once to the admin. Every grant, block and password reset is logged.
- Searches, collections and favorites are per user. Explorar and Ofertas default to **Minhas buscas** (ads from the user's own searches) with a **Toda a base** toggle for everything any customer has mined. Only searches of users with a valid license drive collection.
- /admin has three tabs, mirroring the Trajettu admin: **Licenças** (grant, block, validity, new password, delete, event log), **Webhook de compra** (generate/regenerate the URL, product/offer codes that grant access, days of access per purchase or "until cancelled", per-platform setup steps, last notifications received) and **E-mail** (Resend or SMTP, sender, editable HTML templates for access data and password reset with live preview, test send). These settings live in the database; `.env` values (`WEBHOOK_SECRET`, `WEBHOOK_PRODUCT_IDS`, `SMTP_*`) are only fallbacks until saved in the admin.
- Customers recover their own password from the login screen ("Esqueci minha senha"): a single-use link valid for 1 hour, sent by e-mail.
- Deployment env: `APP_URL`, `API_PUBLIC_URL` (used in e-mail links and the webhook URL), `COOKIE_SECURE=true` in production (app and API must be served from the same site). First admin: `python -m app.create_admin email --senha-provisoria`. Production database is Postgres (`DATABASE_URL`, `postgres://` accepted); local dev stays on SQLite, and `python -m app.import_sqlite` copies a local database into an empty Postgres.
- Users move constantly between Garimppu and the Ad Library, landing pages and checkouts; links out to those are part of the job.
- Part of a marketing product ecosystem sold by the same owner: **Prisma Members**, **Trajettu**, **SendMaster**, **WP Links**. Garimppu is offered as one more product people can buy. How it connects to the others is not yet defined.

## Capabilities and Constraints

- Sources: Playwright scraping of the public Ad Library (default, covers Brazilian commercial ads) plus the official Ad Library API when a token is configured (commercial ads only for EU delivery).
- Meta does not expose spend or results for commercial ads in Brazil. Every ranking is built on **proxies** (duplication, number of advertisers, days active, platforms, growth, advertiser size) and must never be presented as revenue or spend.
- Creative score: duplicates, longevity (saturates at 90 days), platforms, 7-day growth, advertiser size. Offer score: advertisers (heaviest), ads, distinct creatives, longevity.
- Offer detection recognizes checkout platforms (Hotmart, Kiwify, Eduzz, Monetizze, Braip, PerfectPay, Ticto, Greenn, Cakto...), stores and marketplaces, app stores, and conversation links (WhatsApp/Instagram, grouped per page). Affiliate pages on their own domains cannot be linked to the product they sell.
- Meta media URLs expire; images and thumbnails are stored locally.
- Automated scraping may violate Meta's terms: collection is deliberately rate-limited (global budget of runs per hour, prioritized by how overdue a source is times its subscriber count), capped per source and logged out. A run that suddenly returns zero ads after a healthy one is flagged as an error instead of passing silently, since it usually means the Ad Library changed or blocked the collector. No proxy rotation or anti-blocking evasion.
- Terminology used in the UI: minerar, busca, recoleta, criativo, oferta, anunciante, escalado, score de escala, score de oferta, coleção.
- Undecided: pricing, how it is bundled with the other ecosystem products, per-customer usage limits, and legal review of scraping before commercial launch.

## Brand Commitments

- Name: **Garimppu** (from "garimpar ofertas", how the audience already describes the job), spelled with a double consonant and a final "u" like its sibling **Trajettu**, so the products read as one family. Chosen to avoid the saturated "Spy / Miner / Escala" naming of competitors. When spoken, say "com dois pês". Domains garimppu.com and garimppu.com.br were free on 2026-10-12 (garimpu.com too, worth redirecting); trademark (INPI classes 35 and 42) not yet filed.
- Sits beside Prisma Members, Trajettu, SendMaster and WP Links and should read as part of that family.
- Language: Brazilian Portuguese throughout.

## Evidence on Hand

- A working local app with real collected data (searches "renda extra", "forex" and a page search) in `backend/data/miner.db`, with media in `backend/data/media`.
- No customers, testimonials, pricing, case studies or metrics exist yet. Do not fabricate them.

## Product Principles

1. **Offer first, creative second.** The product's answer is "what to sell"; creatives are the evidence and the material to model.
2. **Signals, not promises.** Show why something ranks (advertisers, ads, days, growth) and never imply spend, revenue or guaranteed results.
3. **Fresh beats big.** Catching an offer while it is starting to scale is worth more than a huge stale database; history and growth are the edge.
4. **One click to the source.** Every ad, offer and advertiser links back to the Ad Library, landing page or checkout so the user can verify.
5. **Respect the source.** Collect moderately and transparently; the product must survive Meta's scrutiny if sold.
