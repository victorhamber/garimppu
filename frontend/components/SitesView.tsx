"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, toQuery, type Search, type Site, type SiteOptions, type SitePage } from "@/lib/api";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { CheckToggle, FilterChips, FilterSelect, FilterToggle, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["q", "category", "search_id", "has_ads", "scope", "sort"] as const;
const TYPED_KEYS = ["q"] as const;
const PANEL_KEYS = ["category", "search_id"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "rank", label: "Melhor posição" },
  { id: "rise", label: "Mais subiram" },
  { id: "ads", label: "Mais anúncios" },
  { id: "recent", label: "Entraram recentemente" },
];

export function SitesView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [options, setOptions] = useState<SiteOptions>({ categories: [], rankings: [] });
  const [data, setData] = useState<SitePage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  useSlashFocus("sq");

  const siteSearches = searches.filter((s) => s.source === "sites");
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.category) {
    chips.push({ key: "category", label: options.categories.find((c) => c.id === filters.category)?.label ?? filters.category });
  }
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
    api<SiteOptions>("/api/sites/options").then(setOptions).catch(() => undefined);
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sites mais acessados</h1>

      {data && !data.enabled && (
        <p role="note" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground">
          A busca de sites ainda não está ativada neste servidor: falta configurar o token do Cloudflare
          (<span className="font-mono">CLOUDFLARE_API_TOKEN</span>).
        </p>
      )}

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
          <div className="relative min-w-0 flex-1 basis-full sm:basis-72">
            <label className="sr-only" htmlFor="sq">Buscar nos sites</label>
            <input id="sq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: domínio ou categoria" />
            {!draft.q && <SlashHint />}
          </div>
          {!filters.search_id && <ScopeToggle value={filters.scope} onChange={(v) => update("scope", v)} />}
          <FilterToggle open={panelOpen} count={panelCount} controls="sites-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <CheckToggle label="Só com anúncios coletados" checked={filters.has_ads === "true"}
            onChange={(on) => update("has_ads", on ? "true" : "")} />
        </div>

        <div id="sites-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3">
          <FilterSelect id="s-categoria" label="Categoria" value={filters.category} onChange={(v) => update("category", v)}
            options={options.categories} />
          <FilterSelect id="s-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={siteSearches.map((s) => ({ id: String(s.id), label: `${s.term} (${s.country})` }))} />
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
          {loading && !data ? "Carregando sites..." : `${count} ${total === 1 ? "site" : "sites"}`}
        </span>
        <SortSelect id="ssort" value={filters.sort ?? "rank"} options={SORTS}
          onChange={(v) => update("sort", v === "rank" ? "" : v)} />
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span title={error}>Não foi possível carregar os sites: o servidor do Garimppu não respondeu.</span>
          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhum site com esses filtros." : (
            <>
              Nenhum site nas suas buscas ainda. Crie uma busca do tipo Sites em{" "}
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

      <ol aria-busy={loading || loadingMore}
        className={`flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface transition-opacity ${items.length === 0 ? "hidden" : ""} ${loading && items.length > 0 ? "opacity-60" : ""}`}>
        {items.map((site) => (
          <SiteRow key={`${site.search_term}:${site.ranking}:${site.category}:${site.domain}`} site={site} />
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

function Movement({ site }: { site: Site }) {
  if (site.previous_rank != null) {
    const diff = site.previous_rank - site.rank;
    if (diff === 0) return <span className="text-muted">=</span>;
    return (
      <span className={diff > 0 ? "text-ok" : "text-danger"} title={`Estava em #${site.previous_rank} na coleta anterior`}>
        {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      </span>
    );
  }
  if (site.pct_rank_change != null) {
    return (
      <span className="text-ok" title="Variação de posição calculada pelo Cloudflare">
        ▲ {site.pct_rank_change.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
      </span>
    );
  }
  return <span className="text-muted" title="A variação aparece a partir da próxima coleta">novo</span>;
}

function SiteRow({ site }: { site: Site }) {
  const offerHref = site.offer_key ? `/ofertas?q=${encodeURIComponent(site.offer_key)}&scope=all` : null;
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
      <div className="row-span-2 flex flex-col items-center sm:row-span-1">
        <span className="font-mono text-lg font-semibold tabular-nums">#{site.rank}</span>
        <span className="font-mono text-micro tabular-nums"><Movement site={site} /></span>
      </div>
      <div className="min-w-0">
        <a href={site.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:text-accent">{site.domain}</a>
        <p className="truncate text-xs text-muted">
          {[site.country, site.categories.join(", ")]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 text-xs sm:col-start-3 sm:justify-end">
        {site.meta_ads > 0 && offerHref && (
          <Link href={offerHref} className="rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent hover:bg-accent/10"
            title="Anúncios do Meta já coletados levando para este site">
            {site.meta_ads} {site.meta_ads === 1 ? "anúncio" : "anúncios"} no Meta
          </Link>
        )}
        {site.tiktok_ads > 0 && site.offer_key && (
          <Link href={`/tiktok?offer=${encodeURIComponent(site.offer_key)}`}
            className="rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent hover:bg-accent/10">
            {site.tiktok_ads} no TikTok
          </Link>
        )}
      </div>
    </li>
  );
}
