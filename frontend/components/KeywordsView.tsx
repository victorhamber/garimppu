"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api, timeAgo, toQuery, type Collection, type Keyword, type KeywordPage, type KeywordSuggestions, type ScoreHeat, type Search } from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { CollectionMenu } from "./CollectionMenu";
import { ErrorState } from "./ErrorState";
import { ListSkeleton } from "./Skeleton";
import { ExportCsv } from "./ExportCsv";
import { CheckToggle, FilterChips, FirstRunNote, FilterSelect, FilterToggle, MoreFilters, ScopeToggle, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
import { ConfirmMine } from "./ConfirmMine";
import { COUNTRIES, CountrySelect } from "./CountrySelect";
import { ScoreBadge } from "./Metrics";

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

  const { filters, hasFilters, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  const { collections, reload: reloadCollections } = useCollections();

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
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Palavras-chave</h1>
        <p className="mt-1 text-sm text-muted">Termos que as pessoas mais buscam no Google.</p>
      </div>
      <FirstRunNote show={!filters.scope && data?.scope === "all"} />

      <KeywordSearch nicheLabel={label} />

      <h2 className="mt-4 text-lg font-semibold tracking-tight">Em alta no Google agora</h2>

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
          <FilterToggle open={panelOpen} count={panelCount} controls="keywords-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <MoreFilters open={panelOpen}>
            {!filters.search_id && <ScopeToggle value={filters.scope} effective={data?.scope} onChange={(v) => update("scope", v)} />}
            <CheckToggle label="Só com nicho identificado" checked={filters.has_niche === "true"}
              onChange={(on) => update("has_niche", on ? "true" : "")} />
          </MoreFilters>
        </div>

        <div id="keywords-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-4">
          <FilterSelect id="k-nicho" label="Assunto" value={filters.niche} onChange={(v) => update("niche", v)}
            options={niches.map((n) => ({ id: n.id, label: n.label }))} />
          <FilterSelect id="k-pais" label="País" value={filters.geo} onChange={(v) => update("geo", v)}
            options={(data?.countries ?? []).map((c) => ({ id: c, label: c }))} />
          <FilterSelect id="k-periodo" label="Em alta" value={filters.days} onChange={(v) => update("days", v)} options={PERIODS} />
          <FilterSelect id="k-busca" label="Busca" allLabel="Todas" value={filters.search_id} onChange={(v) => update("search_id", v)}
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
        <span className="text-xs">
          Volume: <span className="rounded bg-hot px-1 font-mono text-micro font-semibold text-accent-ink">mais buscadas</span> top 5% ·{" "}
          <span className="rounded bg-accent px-1 font-mono text-micro font-semibold text-accent-ink">bem buscadas</span> top 20%
          <span className="hidden sm:inline"> deste resultado</span>
        </span>
        <ExportCsv path="/api/keywords/export.csv" filters={filters} disabled={loading || !!error || total === 0} className="ml-auto" />
      </div>

      {error && (
        <ErrorState action="carregar as palavras-chave" error={error} onRetry={() => setAttempt((n) => n + 1)} />
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

      {loading && !error && items.length === 0 && <ListSkeleton variant="rows" count={8} />}

      <ol aria-busy={loading || loadingMore}
        className={`flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface transition-opacity ${items.length === 0 ? "hidden" : ""} ${loading && items.length > 0 ? "opacity-60" : ""}`}>
        {items.map((keyword) => (
          <KeywordRow key={keyword.id} keyword={keyword} heat={data?.heat} nicheLabel={label(keyword.niche)} collections={collections}
            onCollectionsChange={(ids) => {
              setData((d) => d && { ...d, items: d.items.map((k) => (k.id === keyword.id ? { ...k, collection_ids: ids } : k)) });
              reloadCollections();
            }} />
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
    <span className={up ? "text-foreground" : "text-danger"} title={`No dia anterior em alta: ${formatTraffic(before)} buscas`}>
      {up ? "▲" : "▼"} {Math.round(Math.abs(traffic / before - 1) * 100)}%
    </span>
  );
}

const LINK_CLASS = "pill";
const SUGGEST_PAGE = 40;

/** Searches around the user's own term, from Google's autocomplete, ordered by how often Google suggests them. */
function KeywordSearch({ nicheLabel }: { nicheLabel: (id: string | null) => string | null }) {
  const [term, setTerm] = useState("");
  const [country, setCountry] = useState("BR");
  const [result, setResult] = useState<KeywordSuggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(SUGGEST_PAGE);
  useSlashFocus("kw-term");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<KeywordSuggestions>(`/api/keywords/suggest${toQuery({ term: term.trim(), country, limit: 150 })}`));
      setShown(SUGGEST_PAGE);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = result?.items ?? [];
  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={search} role="search" aria-label="Pesquisar palavra-chave"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-72">
          <label className="label" htmlFor="kw-term">Palavra-chave</label>
          <input id="kw-term" type="search" enterKeyHint="search" className="field" value={term} maxLength={80} aria-keyshortcuts="/"
            onChange={(e) => setTerm(e.target.value)} placeholder="ex.: creatina, renda extra, emagrecer" />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="kw-country">País</label>
          <CountrySelect id="kw-country" value={country} onChange={setCountry} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || term.trim().length < 2}>
          {busy ? "Pesquisando..." : "Pesquisar"}
        </button>
      </form>

      {busy && <p role="status" className="text-sm text-muted">Consultando o Google (leva uns 10 segundos)...</p>}
      {error && <ErrorState action="pesquisar no Google" error={error} compact />}
      {result && !busy && (
        items.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma busca encontrada para “{result.term}”.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {items.length} buscas relacionadas a “{result.term}” ({result.country}), das mais para as menos sugeridas pelo Google.
              A barra compara cada uma com a mais sugerida (100).
            </p>
            <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {items.slice(0, shown).map((s, i) => (
                <li key={s.term} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-2.5 lg:grid-cols-[2.5rem_minmax(0,1fr)_auto] lg:items-center">
                  <span className="pt-0.5 font-mono text-xs text-muted">#{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{s.term}</span>
                      {s.trending && <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 text-micro font-medium text-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />em alta</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${s.popularity}%` }} />
                      </span>
                      <span>{s.popularity}</span>
                      {s.niche && <span>· {nicheLabel(s.niche)}</span>}
                    </div>
                  </div>
                  <KeywordActions term={s.term} geo={result.country} metaAds={s.meta_ads} />
                </li>
              ))}
            </ol>
            {items.length > shown && (
              <button type="button" className="btn mx-auto" onClick={() => setShown((n) => n + SUGGEST_PAGE)}>
                Mostrar mais ({items.length - shown} restantes)
              </button>
            )}
          </>
        )
      )}
    </section>
  );
}

type KeywordActionsProps = { term: string; geo: string; metaAds: number | null; children?: ReactNode };

function KeywordActions({ term: raw, geo, metaAds, children }: KeywordActionsProps) {
  const [mined, setMined] = useState(false);
  const term = encodeURIComponent(raw);
  const country = COUNTRIES.find((c) => c.id === geo)?.label ?? geo;

  async function mineMeta() {
    await api<Search>("/api/searches", {
      method: "POST",
      body: JSON.stringify({ term: raw, country: geo, source: "hybrid", refresh_hours: 24 }),
    });
    setMined(true);
  }

  return (
    <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-3 lg:max-w-80 lg:justify-end">
      {metaAds != null && metaAds > 0 && (
        <Link href={`/criativos?q=${term}&scope=all`} className="pill"
          title="Anúncios do Meta já coletados que citam o termo">
          {metaAds > 99 ? "99+" : metaAds} {metaAds === 1 ? "anúncio" : "anúncios"} no Meta
        </Link>
      )}
      <a href={`https://trends.google.com/trends/explore?geo=${geo}&q=${term}`} target="_blank" rel="noreferrer"
        className={LINK_CLASS} title="Curva de interesse no Google Trends">
        Trends
      </a>
      <a href={`https://www.google.com/search?q=${term}`} target="_blank" rel="noreferrer" className={LINK_CLASS}>
        Google
      </a>
      <Link href={`/criativos?q=${term}&scope=all`} className={LINK_CLASS} title="Criativos já coletados com o termo">Criativos</Link>
      {mined ? (
        <Link href="/buscas" className="rounded-full border border-ok/40 px-2 py-0.5 text-micro text-ok pointer-coarse:py-2">
          Busca criada no Meta
        </Link>
      ) : (
        <ConfirmMine
          label="Minerar no Meta"
          consequence={`Cria a busca "${raw}" e coleta até 300 anúncios ativos em ${country} da Biblioteca de Anúncios da Meta. A coleta roda em segundo plano e leva alguns minutos; você acompanha em Minerar.`}
          onConfirm={mineMeta}
          openerClassName="pill"
        />
      )}
      {children}
    </div>
  );
}

type KeywordRowProps = {
  keyword: Keyword;
  heat?: ScoreHeat | null;
  nicheLabel: string | null;
  collections: Collection[];
  onCollectionsChange: (ids: number[]) => void;
};

export function KeywordRow({ keyword, heat, nicheLabel, collections, onCollectionsChange }: KeywordRowProps) {
  const days = keyword.days_trending;
  const since = keyword.trending_now ? "em alta agora" : `em alta pela última vez ${timeAgo(keyword.last_seen_at) ?? ""}`;

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3 lg:grid-cols-[4.5rem_minmax(0,1fr)_auto] lg:items-center">
      <div className="row-span-2 flex flex-col items-center gap-0.5 lg:row-span-1">
        <ScoreBadge value={keyword.peak_traffic ?? 0} heat={heat} title="Pico estimado de buscas">
          {formatTraffic(keyword.peak_traffic)}
        </ScoreBadge>
        <span className="font-mono text-micro tabular-nums"><Growth keyword={keyword} /></span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{keyword.term}</span>
          {keyword.trending_now && (
            <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 text-micro font-medium text-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />em alta agora</span>
          )}
        </div>
        <p className="text-xs text-muted">
          {[
            nicheLabel ?? "nicho não identificado",
            keyword.geo,
            days > 1 ? `em alta há ${days} dias` : "em alta hoje",
            keyword.trending_now ? null : since,
            keyword.first_seen_at && `visto pela 1ª vez ${timeAgo(keyword.first_seen_at)}`,
          ].filter(Boolean).join(" · ")}
        </p>
        {keyword.news.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {keyword.news.map((n) => (
              <li key={n.url} className="truncate text-xs">
                <a href={n.url} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                  {n.title}
                </a>
                {n.source && <span className="text-muted"> · {n.source}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <KeywordActions term={keyword.term} geo={keyword.geo} metaAds={keyword.meta_ads}>
        <CollectionMenu target={{ kind: "keyword", ref: String(keyword.id) }} selected={keyword.collection_ids} collections={collections}
          onChange={onCollectionsChange} itemName={`a palavra-chave ${keyword.term}`} />
      </KeywordActions>
    </li>
  );
}
