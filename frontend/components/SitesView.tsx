"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mediaUrl, toQuery, type Collection, type ScoreHeat, type Search, type Site, type SitePage } from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { CollectionMenu } from "./CollectionMenu";
import { CoverImage, VideoFallback } from "./CoverImage";
import { ErrorState } from "./ErrorState";
import { ListSkeleton } from "./Skeleton";
import { ExportCsv } from "./ExportCsv";
import { Metric, MetricStrip, ScoreBadge, ScoreLegend, topMetric } from "./Metrics";
import { CheckToggle, FilterChips, FirstRunNote, FilterSelect, FilterToggle, HiddenBrandsNote, MoreFilters, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";

const PAGE_SIZE = 30;
const FILTER_KEYS = ["q", "niche", "search_id", "active_only", "include_brands", "scope", "sort"] as const;
const TYPED_KEYS = ["q"] as const;
const PANEL_KEYS = ["niche", "search_id"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "score", label: "Maior nota" },
  { id: "advertisers", label: "Mais anunciantes" },
  { id: "ads", label: "Mais anúncios" },
  { id: "products", label: "Mais produtos" },
  { id: "days_active", label: "Mais tempo no ar" },
  { id: "recent", label: "Novos primeiro" },
];

export function SitesView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [data, setData] = useState<SitePage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { niches, label } = useNiches();

  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  const { collections, reload: reloadCollections } = useCollections();
  useSlashFocus("sq");

  const adSearches = searches.filter((s) => s.source === "scraper" || s.source === "api" || s.source === "hybrid");
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.niche) chips.push({ key: "niche", label: label(filters.niche) ?? filters.niche });
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Mineração: ${search?.term ?? filters.search_id}` });
  }

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<SitePage>(`/api/sites${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
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
      const page = await api<SitePage>(`/api/sites${toQuery({ ...filters, limit: PAGE_SIZE, offset: data.items.length })}`);
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
  if (loading) status = "Carregando sites...";
  else if (loadingMore) status = "Carregando mais sites...";
  else if (!error && total === 0) status = "Nenhum site encontrado.";
  else if (!error) status = `${count} ${total === 1 ? "site encontrado" : "sites encontrados"}.`;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sites de venda</h1>
        <p className="mt-1 text-sm text-muted">Sites dos concorrentes que mais anunciam.</p>
      </div>
      <FirstRunNote show={!filters.scope && data?.scope === "all"} />

      <form
        role="search"
        aria-label="Filtros de sites"
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
          <div className="relative min-w-0 flex-1 basis-0 sm:basis-72">
            <label className="sr-only" htmlFor="sq">Buscar sites</label>
            <input id="sq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: site ou anunciante" />
            {!draft.q && <SlashHint />}
          </div>
          <FilterToggle open={panelOpen} count={panelCount} controls="sites-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <MoreFilters open={panelOpen}>
            {!filters.search_id && <ScopeToggle value={filters.scope} effective={data?.scope} onChange={(v) => update("scope", v)} />}
            <CheckToggle label="Somente ativos" checked={filters.active_only !== "false"}
              onChange={(on) => update("active_only", on ? "" : "false")} />
          </MoreFilters>
        </div>

        <div id="sites-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3">
          <FilterSelect id="s-nicho" label="Nicho" value={filters.niche} onChange={(v) => update("niche", v)}
            options={niches.map((n) => ({ id: n.id, label: n.label }))} />
          <FilterSelect id="s-busca" label="Mineração" allLabel="Todas" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={adSearches.map((s) => ({ id: String(s.id), label: s.term }))} />
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
            {loading && !data ? "Carregando sites..." : `${count} ${total === 1 ? "site" : "sites"}`}
          </span>
          <SortSelect id="ssort" value={filters.sort ?? "score"} options={SORTS}
            onChange={(v) => update("sort", v === "score" ? "" : v)} />
          {!loading && <HiddenBrandsNote count={data?.hidden_brands ?? 0} noun="sites" onShow={() => update("include_brands", "true")} />}
          <ExportCsv path="/api/sites/export.csv" filters={filters} disabled={loading || !!error || total === 0} className="ml-auto" />
        </div>
        {total > 0 && <ScoreLegend kind="site" />}
      </div>

      {error && (
        <ErrorState action="carregar os sites" error={error} onRetry={() => setAttempt((n) => n + 1)} />
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhum site com esses filtros." : (
            <>
              Nenhum site de venda nos anúncios das suas buscas ainda. Crie uma busca de anúncios em{" "}
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

      {loading && !error && items.length === 0 && <ListSkeleton variant="thumb-rows" />}

      <ol aria-busy={loading || loadingMore}
        className={`flex flex-col gap-3 transition-opacity ${items.length === 0 ? "hidden" : ""} ${loading && items.length > 0 ? "opacity-60" : ""}`}>
        {items.map((site, i) => (
          <li key={site.domain}>
            <SiteRow site={site} rank={i + 1} nicheLabel={label(site.niche)} heat={data?.heat} collections={collections}
              onCollectionsChange={(ids) => {
                setData((d) => d && { ...d, items: d.items.map((s) => (s.domain === site.domain ? { ...s, collection_ids: ids } : s)) });
                reloadCollections();
              }} />
          </li>
        ))}
      </ol>

      {data && items.length < data.total && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="btn mx-auto">
          {loadingMore ? "Carregando..." : `Carregar mais (${data.total - items.length} restantes)`}
        </button>
      )}
    </div>
  );
}

type SiteRowProps = {
  site: Site;
  rank: number;
  nicheLabel: string | null;
  heat?: ScoreHeat;
  collections: Collection[];
  onCollectionsChange: (ids: number[]) => void;
};

export function SiteRow({ site, rank, nicheLabel, heat, collections, onCollectionsChange }: SiteRowProps) {
  const domain = encodeURIComponent(site.domain);
  return (
    <article className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
      <div className="grid grid-cols-4 gap-1.5 sm:row-span-2 sm:flex sm:self-start xl:row-span-1 xl:self-center">
        {site.previews.map((p, i) => (
          <Link key={p.creative_id} href={`/criativos/${p.creative_id}`}
            aria-label={`Criativo ${i + 1} de ${site.domain}${p.media_type === "video" ? " (vídeo)" : ""}`}
            className="relative aspect-square overflow-hidden rounded-md bg-surface-2 sm:size-16 sm:shrink-0 lg:size-20">
            {p.image ? (
              <CoverImage src={mediaUrl(p.image)!} alt="" className="h-full w-full object-cover"
                fallback={p.media_type === "video" ? <VideoFallback compact /> : <span className="line-clamp-4 p-1.5 text-micro leading-tight text-muted">{p.text ?? "Sem mídia"}</span>} />
            ) : (
              <span className="line-clamp-4 p-1.5 text-micro leading-tight text-muted">{p.text ?? "Sem mídia"}</span>
            )}
            {p.media_type === "video" && (
              <span className="absolute bottom-1 left-1 rounded border border-line bg-background/85 px-1 text-micro text-foreground">vídeo</span>
            )}
          </Link>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted">#{rank}</span>
          <a href={site.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium hover:text-accent" title={site.url}>
            {site.domain}
          </a>
          {nicheLabel && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted">{nicheLabel}</span>}
          {site.platform && (
            <span className="rounded-full border border-line px-2 py-0.5 text-micro text-foreground">{site.platform}</span>
          )}
          <ScoreBadge value={site.score} heat={heat} title="Nota do site" className="ml-auto" />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {site.top_advertisers.map((a) => (
            <Link key={a.page_id} href={`/anunciantes/${a.page_id}`} className="hover:text-accent">
              {a.name ?? a.page_id} <span className="font-mono">({a.ads})</span>
            </Link>
          ))}
          {site.advertisers > site.top_advertisers.length && (
            <span>+{site.advertisers - site.top_advertisers.length} anunciantes</span>
          )}
          {site.tiktok_ads > 0 && <span className="text-foreground">{site.tiktok_ads} no TikTok</span>}
          {site.videos > 0 && <span className="text-foreground">{site.videos} no YouTube</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/?q=${domain}&scope=all`}
            className="pill">
            Ver ofertas e anúncios
          </Link>
          <a href={site.url} target="_blank" rel="noreferrer"
            className="pill">
            Abrir site
          </a>
          <CollectionMenu target={{ kind: "site", ref: site.domain }} selected={site.collection_ids} collections={collections}
            onChange={onCollectionsChange} itemName={`o site ${site.domain}`} />
        </div>
      </div>

      <MetricStrip className="w-full grid-cols-2 min-[440px]:grid-cols-4 sm:col-start-2 sm:w-auto sm:min-w-72 md:min-w-96 xl:col-start-3">
        <Metric label="anunciantes" value={site.advertisers} strong={topMetric(heat, "advertisers", site.advertisers)} />
        <Metric label="anúncios" value={site.ads} strong={topMetric(heat, "ads", site.ads)} />
        <Metric label="produtos" value={site.products} strong={topMetric(heat, "products", site.products)} />
        <Metric label="dias no ar" value={site.days_active} strong={topMetric(heat, "days_active", site.days_active)} />
      </MetricStrip>
    </article>
  );
}
