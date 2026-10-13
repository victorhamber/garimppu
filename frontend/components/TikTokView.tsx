"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mediaUrl, timeAgo, toQuery, type ScoreHeat, type Search, type TikTokAd, type TikTokAdPage, type TikTokIndustry } from "@/lib/api";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { CoverImage, VideoFallback } from "./CoverImage";
import { CheckToggle, FilterChips, FilterSelect, FilterToggle, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
import { HEAT_HINT, heatClass, ScoreLegend } from "./Metrics";

const PAGE_SIZE = 30;
const FILTER_KEYS = ["q", "industry", "search_id", "objective", "has_offer", "offer", "scope", "sort"] as const;
const TYPED_KEYS = ["q"] as const;
const PANEL_KEYS = ["industry", "search_id", "objective"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "score", label: "Score TikTok" },
  { id: "ctr", label: "Melhor CTR do nicho" },
  { id: "likes", label: "Mais curtidas" },
  { id: "comments", label: "Mais comentários" },
  { id: "shares", label: "Mais compartilhados" },
  { id: "recent", label: "Encontrados recentemente" },
];
const OBJECTIVES = [
  { id: "campaign_objective_conversion", label: "Conversões" },
  { id: "campaign_objective_product_sales", label: "Vendas de produto" },
  { id: "campaign_objective_traffic", label: "Tráfego" },
  { id: "campaign_objective_lead_generation", label: "Geração de leads" },
  { id: "campaign_objective_app_install", label: "Instalação de app" },
  { id: "campaign_objective_reach", label: "Alcance" },
  { id: "campaign_objective_video_view", label: "Visualizações" },
];
const BUDGETS = ["Verba baixa", "Verba média", "Verba alta"];

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "3%" from TikTok's CTR percentile (0.03), read as "top 3%". */
function formatCtr(rank: number | null): string {
  if (rank == null) return "—";
  const pct = Math.max(rank * 100, 1);
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function TikTokView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [industries, setIndustries] = useState<TikTokIndustry[]>([]);
  const [data, setData] = useState<TikTokAdPage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  useSlashFocus("tq");

  const tiktokSearches = searches.filter((s) => s.source === "tiktok");
  const industryOptions = industries.map((i) => ({ id: String(i.id), label: i.label }));
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.industry) {
    chips.push({ key: "industry", label: industryOptions.find((i) => i.id === filters.industry)?.label ?? filters.industry });
  }
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }
  if (filters.objective) {
    chips.push({ key: "objective", label: OBJECTIVES.find((o) => o.id === filters.objective)?.label ?? filters.objective });
  }
  if (filters.offer) chips.push({ key: "offer", label: `Oferta: ${filters.offer}` });

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
    api<TikTokIndustry[]>("/api/tiktok/industries").then(setIndustries).catch(() => setIndustries([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<TikTokAdPage>(`/api/tiktok/ads${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
      .then((page) => {
        if (cancelled) return;
        setData(page);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setData(null);
        setError(e.message);
      })
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [key, filtersKey]);

  async function loadMore() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const page = await api<TikTokAdPage>(`/api/tiktok/ads${toQuery({ ...filters, limit: PAGE_SIZE, offset: data.items.length })}`);
      setData({ ...page, items: [...data.items, ...page.items] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const count = total.toLocaleString("pt-BR");

  let status = "";
  if (loading) status = "Carregando anúncios...";
  else if (loadingMore) status = "Carregando mais anúncios...";
  else if (!error && total === 0) status = "Nenhum anúncio encontrado.";
  else if (!error && items.length < total) status = `Mostrando ${items.length.toLocaleString("pt-BR")} de ${count} anúncios.`;
  else if (!error) status = `${count} ${total === 1 ? "anúncio encontrado" : "anúncios encontrados"}.`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Top anúncios do TikTok</h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
          Anúncios que o próprio TikTok aponta como os de melhor desempenho nos últimos 180 dias (Creative Center), por nicho.
          O CTR é comparado com os outros anúncios do mesmo nicho: “top 5%” quer dizer que ele recebe mais cliques que 95% deles.
          A página de destino vira oferta.
        </p>
      </div>

      <form
        role="search"
        aria-label="Filtros de anúncios do TikTok"
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
            e.preventDefault();
            flush();
          }
        }}
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-72">
            <label className="sr-only" htmlFor="tq">Buscar nos anúncios</label>
            <input id="tq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: texto do anúncio ou link de destino" />
            {!draft.q && <SlashHint />}
          </div>
          {!filters.search_id && <ScopeToggle value={filters.scope} onChange={(v) => update("scope", v)} />}
          <FilterToggle open={panelOpen} count={panelCount} controls="tiktok-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <CheckToggle label="Só com oferta identificada" checked={filters.has_offer === "true"}
            onChange={(on) => update("has_offer", on ? "true" : "")} />
        </div>

        <div id="tiktok-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-3">
          <FilterSelect id="t-nicho" label="Nicho" value={filters.industry} onChange={(v) => update("industry", v)} options={industryOptions} />
          <FilterSelect id="t-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={tiktokSearches.map((s) => ({ id: String(s.id), label: `${s.term} (${s.country})` }))} />
          <FilterSelect id="t-objetivo" label="Objetivo" value={filters.objective} onChange={(v) => update("objective", v)} options={OBJECTIVES} />
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
            {loading && !data ? "Carregando anúncios..." : `${count} ${total === 1 ? "anúncio" : "anúncios"}`}
          </span>
          <SortSelect id="tsort" value={filters.sort ?? "score"} options={SORTS}
            onChange={(v) => update("sort", v === "score" ? "" : v)} />
        </div>
        {total > 0 && <ScoreLegend kind="tiktok" />}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span title={error}>Não foi possível carregar os anúncios: o servidor do Garimppu não respondeu.</span>
          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhum anúncio com esses filtros." : (
            <>
              Nenhum anúncio do TikTok nas suas buscas ainda. Crie uma busca com fonte TikTok Ads em{" "}
              <Link href="/buscas" className="text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent">Minerar</Link>{" "}
              ou veja{" "}
              <button type="button" onClick={() => update("scope", "all")}
                className="text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent">
                toda a base
              </button>.
            </>
          )}
        </div>
      )}

      <div aria-busy={loading || loadingMore}
        className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${loading && items.length > 0 ? "opacity-60" : ""}`}>
        {items.map((ad, i) => (
          <TikTokCard key={ad.id} ad={ad} rank={i + 1} heat={data?.heat} />
        ))}
      </div>

      {data && items.length < data.total && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="btn mx-auto">
          {loadingMore ? "Carregando..." : `Carregar mais (${data.total - items.length} restantes)`}
        </button>
      )}
    </div>
  );
}

/** Same parts as backend pipeline/tiktok_ingest.py, so the card can show where the score comes from. */
function scoreParts(ad: TikTokAd) {
  const talk = ad.comments != null || ad.shares != null ? 0.5 * Math.log10(1 + (ad.comments ?? 0) + 2 * (ad.shares ?? 0)) : null;
  return [
    { label: "CTR", value: ad.ctr_rank != null ? 3 * (1 - Math.min(Math.max(ad.ctr_rank, 0), 1)) : null },
    { label: "curtidas", value: 0.5 * Math.log10(1 + ad.likes) },
    { label: "conversa", value: talk },
    { label: "verba", value: 0.25 * (ad.budget ?? 0) },
  ];
}

const fmtPart = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function TikTokCard({ ad, rank, heat }: { ad: TikTokAd; rank: number; heat?: ScoreHeat }) {
  const duration = formatDuration(ad.duration_s);
  const title = ad.title?.trim() && ad.title.trim() !== "." ? ad.title.trim() : "Anúncio sem texto";
  const cover = mediaUrl(ad.cover);
  const host = hostOf(ad.landing_page);
  const parts = scoreParts(ad);
  const topCtr = ad.ctr_rank != null && ad.ctr_rank <= 0.1;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <a href={ad.url} target="_blank" rel="noreferrer" className="relative block aspect-square bg-surface-2"
        aria-label={`Assistir no Creative Center do TikTok: ${title}`}>
        {cover ? (
          <CoverImage src={cover} alt="" className="h-full w-full object-cover" fallback={<VideoFallback compact />} />
        ) : (
          <VideoFallback compact />
        )}
        {ad.ctr_rank != null && (
          <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-micro font-semibold ${topCtr ? "bg-hot text-accent-ink" : "bg-background/85 text-foreground"}`}>
            CTR top {formatCtr(ad.ctr_rank)}
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-micro text-foreground">{duration}</span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <span className="pt-0.5 font-mono text-xs text-muted">#{rank}</span>
          <h2 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug" title={title}>
            <a href={ad.url} target="_blank" rel="noreferrer" className="hover:text-accent">{title}</a>
          </h2>
          <span title={`Score TikTok = ${parts.map((p) => `${p.label} ${fmtPart(p.value)}`).join(" + ")} (${HEAT_HINT})`}
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${heatClass(ad.score, heat)}`}>
            {ad.score.toFixed(2)}
          </span>
        </div>
        <p className="truncate text-xs text-muted">
          {[ad.brand ?? host, ad.industry, ad.objective, ad.budget != null ? BUDGETS[ad.budget] : null, timeAgo(ad.first_seen_at)]
            .filter(Boolean).join(" · ")}
        </p>

        <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
          <Metric label="CTR top" value={formatCtr(ad.ctr_rank)} strong={topCtr}
            title="Posição do CTR entre os anúncios do mesmo nicho: 3% = melhor que 97% deles" />
          <Metric label="curtidas" value={compact.format(ad.likes)} strong={ad.likes >= 50_000} />
          <Metric label="coment." value={ad.comments != null ? compact.format(ad.comments) : "—"} />
          <Metric label="compart." value={ad.shares != null ? compact.format(ad.shares) : "—"} strong={(ad.shares ?? 0) >= 1_000} />
        </dl>
        <p className="text-micro text-muted">
          Pontos: {parts.map((p) => `${p.label} ${fmtPart(p.value)}`).join(" · ")}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {ad.landing_page && !ad.offer_key && (
            <a href={ad.landing_page} target="_blank" rel="noreferrer" className="max-w-[60%] truncate text-muted hover:text-foreground"
              title={ad.landing_page}>
              {host ?? "Página de destino"}
            </a>
          )}
          {ad.offer_key && (
            <Link href={`/?offer=${encodeURIComponent(ad.offer_key)}`} title={`Ver anúncios desta oferta no Meta (${ad.offer_key})`}
              className="ml-auto max-w-full truncate rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent hover:bg-accent/10">
              {ad.offer_label ?? ad.offer_key}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, strong, title }: { label: string; value: string; strong?: boolean; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse bg-surface px-1 py-1.5" title={title}>
      <dt className="micro truncate max-xl:tracking-normal">{label}</dt>
      <dd className={`font-mono text-sm tabular-nums ${strong ? "text-accent" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}
