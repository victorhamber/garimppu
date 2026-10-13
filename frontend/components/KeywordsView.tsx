"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, timeAgo, toQuery, type Keyword, type KeywordPage, type ScoreHeat, type Search } from "@/lib/api";
import { useNiches } from "@/lib/hooks";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { CheckToggle, FilterChips, FilterSelect, FilterToggle, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
import { HEAT_HINT, heatClass } from "./Metrics";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["q", "niche", "geo", "days", "search_id", "scope", "sort", "has_niche"] as const;
const TYPED_KEYS = ["q"] as const;
const PANEL_KEYS = ["niche", "geo", "days", "search_id"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "traffic", label: "Mais pesquisadas" },
  { id: "days", label: "Mais dias em alta" },
  { id: "recent", label: "Em alta agora" },
  { id: "new", label: "Novas primeiro" },
];
const PERIODS = [
  { id: "1", label: "Últimas 24 horas" },
  { id: "7", label: "Últimos 7 dias" },
  { id: "30", label: "Últimos 30 dias" },
];

/** Google rounds trends to "200+", "20 mil+", "1 mi+". */
function formatTraffic(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi+`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil+`;
  return `${value}+`;
}

export function KeywordsView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [data, setData] = useState<KeywordPage | null>(null);
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
  useSlashFocus("kq");

  const trendSearches = searches.filter((s) => s.source === "trends");
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.niche) chips.push({ key: "niche", label: label(filters.niche) ?? filters.niche });
  if (filters.geo) chips.push({ key: "geo", label: `País: ${filters.geo}` });
  if (filters.days) chips.push({ key: "days", label: PERIODS.find((p) => p.id === filters.days)?.label ?? `${filters.days} dias` });
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<KeywordPage>(`/api/keywords${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
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
      const page = await api<KeywordPage>(`/api/keywords${toQuery({ ...filters, limit: PAGE_SIZE, offset: data.items.length })}`);
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
  const noun = total === 1 ? "palavra-chave" : "palavras-chave";

  let status = "";
  if (loading) status = "Carregando palavras-chave...";
  else if (loadingMore) status = "Carregando mais palavras-chave...";
  else if (!error && total === 0) status = "Nenhuma palavra-chave encontrada.";
  else if (!error) status = `${count} ${noun} ${total === 1 ? "encontrada" : "encontradas"}.`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Palavras-chave em alta</h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
          O que o país está pesquisando no Google agora, segundo o Google Trends, coletado a cada hora e separado por
          nicho. O volume é a estimativa de buscas do próprio Google (ex.: 20 mil+). Use os termos para achar ofertas no
          Meta antes de todo mundo.
        </p>
      </div>

      <form
        role="search"
        aria-label="Filtros de palavras-chave"
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
            <label className="sr-only" htmlFor="kq">Buscar nas palavras-chave</label>
            <input id="kq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar termo" />
            {!draft.q && <SlashHint />}
          </div>
          {!filters.search_id && <ScopeToggle value={filters.scope} onChange={(v) => update("scope", v)} />}
          <FilterToggle open={panelOpen} count={panelCount} controls="keywords-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <CheckToggle label="Só com nicho identificado" checked={filters.has_niche === "true"}
            onChange={(on) => update("has_niche", on ? "true" : "")} />
        </div>

        <div id="keywords-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-4">
          <FilterSelect id="k-nicho" label="Nicho" value={filters.niche} onChange={(v) => update("niche", v)}
            options={niches.map((n) => ({ id: n.id, label: n.label }))} />
          <FilterSelect id="k-pais" label="País" value={filters.geo} onChange={(v) => update("geo", v)}
            options={(data?.countries ?? []).map((c) => ({ id: c, label: c }))} />
          <FilterSelect id="k-periodo" label="Em alta" value={filters.days} onChange={(v) => update("days", v)} options={PERIODS} />
          <FilterSelect id="k-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={trendSearches.map((s) => ({ id: String(s.id), label: s.term }))} />
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
          {loading && !data ? "Carregando palavras-chave..." : `${count} ${noun}`}
        </span>
        <SortSelect id="ksort" value={filters.sort ?? "traffic"} options={SORTS}
          onChange={(v) => update("sort", v === "traffic" ? "" : v)} />
        <span className="text-xs" title={`Destaque do volume: ${HEAT_HINT}`}>
          <span className="rounded bg-hot px-1 font-mono text-micro font-semibold text-accent-ink">brasa</span> top 5% ·{" "}
          <span className="rounded bg-accent px-1 font-mono text-micro font-semibold text-accent-ink">âmbar</span> top 20%
        </span>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span title={error}>Não foi possível carregar as palavras-chave: o servidor do Garimppu não respondeu.</span>
          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhuma palavra-chave com esses filtros." : (
            <>
              Nenhuma palavra-chave nas suas buscas ainda. Crie uma busca do tipo Palavras-chave em alta em{" "}
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
        {items.map((keyword) => (
          <KeywordRow key={keyword.id} keyword={keyword} heat={data?.heat} nicheLabel={label(keyword.niche)} />
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

function Growth({ keyword }: { keyword: Keyword }) {
  const { traffic, previous_traffic: before } = keyword;
  if (traffic == null || before == null || before === 0 || traffic === before) return null;
  const up = traffic > before;
  return (
    <span className={up ? "text-ok" : "text-danger"} title={`No dia anterior em alta: ${formatTraffic(before)} buscas`}>
      {up ? "▲" : "▼"} {Math.round(Math.abs(traffic / before - 1) * 100)}%
    </span>
  );
}

function KeywordRow({ keyword, heat, nicheLabel }: { keyword: Keyword; heat?: ScoreHeat | null; nicheLabel: string | null }) {
  const [mining, setMining] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [mineError, setMineError] = useState<string | null>(null);
  const term = encodeURIComponent(keyword.term);
  const days = keyword.days_trending;
  const since = keyword.trending_now ? "em alta agora" : `visto ${timeAgo(keyword.last_seen_at) ?? ""}`;
  const linkClass = "rounded-full border border-line px-2 py-0.5 text-micro text-muted transition-colors hover:border-accent/60 hover:text-foreground pointer-coarse:py-2";

  async function mineMeta() {
    setMining("busy");
    setMineError(null);
    try {
      await api<Search>("/api/searches", {
        method: "POST",
        body: JSON.stringify({ term: keyword.term, country: keyword.geo, source: "hybrid", refresh_hours: 24 }),
      });
      setMining("done");
    } catch (e) {
      setMining("error");
      setMineError((e as Error).message);
    }
  }

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3 lg:grid-cols-[4.5rem_minmax(0,1fr)_auto] lg:items-center">
      <div className="row-span-2 flex flex-col items-center gap-0.5 lg:row-span-1">
        <span title={`Pico estimado de buscas (${HEAT_HINT})`}
          className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap tabular-nums ${heatClass(keyword.peak_traffic ?? 0, heat)}`}>
          {formatTraffic(keyword.peak_traffic)}
        </span>
        <span className="font-mono text-micro tabular-nums"><Growth keyword={keyword} /></span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{keyword.term}</span>
          {keyword.trending_now && (
            <span className="rounded bg-ok/15 px-1.5 text-micro font-medium text-ok">agora</span>
          )}
        </div>
        <p className="text-xs text-muted">
          {[
            nicheLabel ?? "nicho não identificado",
            keyword.geo,
            days > 1 ? `em alta há ${days} dias` : "em alta hoje",
            keyword.trending_now ? null : since,
            `desde ${timeAgo(keyword.first_seen_at) ?? ""}`,
          ].filter(Boolean).join(" · ")}
        </p>
        {keyword.news.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {keyword.news.map((n) => (
              <li key={n.url} className="truncate text-xs">
                <a href={n.url} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                  {n.title}
                </a>
                {n.source && <span className="text-muted/70"> · {n.source}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-3 lg:max-w-80 lg:justify-end">
        {keyword.meta_ads != null && keyword.meta_ads > 0 && (
          <Link href={`/?q=${term}&scope=all`} className="rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent hover:bg-accent/10 pointer-coarse:py-2"
            title="Anúncios do Meta já coletados que citam o termo">
            {keyword.meta_ads > 99 ? "99+" : keyword.meta_ads} {keyword.meta_ads === 1 ? "anúncio" : "anúncios"} no Meta
          </Link>
        )}
        <a href={`https://trends.google.com/trends/explore?geo=${keyword.geo}&q=${term}&date=now%207-d`} target="_blank" rel="noreferrer"
          className={linkClass} title="Curva de interesse dos últimos 7 dias no Google Trends">
          Trends
        </a>
        <a href={`https://www.google.com/search?q=${term}`} target="_blank" rel="noreferrer" className={linkClass}>
          Google
        </a>
        <Link href={`/?q=${term}&scope=all`} className={linkClass} title="Criativos já coletados com o termo">Explorar</Link>
        {mining === "done" ? (
          <Link href="/buscas" className="rounded-full border border-ok/40 px-2 py-0.5 text-micro text-ok pointer-coarse:py-2">
            Busca criada no Meta
          </Link>
        ) : (
          <button type="button" onClick={mineMeta} disabled={mining === "busy"}
            className="rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent transition-colors hover:bg-accent/10 disabled:opacity-60 pointer-coarse:py-2"
            title={mineError ?? "Cria uma busca de anúncios no Meta com este termo"}>
            {mining === "busy" ? "Criando..." : mining === "error" ? "Erro, tentar de novo" : "Minerar no Meta"}
          </button>
        )}
      </div>
    </li>
  );
}
