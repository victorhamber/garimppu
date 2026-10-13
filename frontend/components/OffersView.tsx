"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mediaUrl, OFFER_KIND_LABEL, OFFER_KINDS, toQuery, type Collection, type Offer, type OfferPage, type ScoreHeat, type Search } from "@/lib/api";
import { useCollections } from "@/lib/hooks";
import { digitsOnly, useUrlFilters } from "@/lib/useUrlFilters";
import { CollectionMenu } from "./CollectionMenu";
import { CoverImage, VideoFallback } from "./CoverImage";
import { ErrorState } from "./ErrorState";
import { ExportCsv } from "./ExportCsv";
import { CheckToggle, FilterChips, FilterSelect, FilterToggle, HiddenBrandsNote, MoreFilters, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
import { Metric, MetricStrip, ScoreBadge, ScoreLegend, topMetric } from "./Metrics";

const PAGE_SIZE = 30;
const FILTER_KEYS = ["q", "kind", "platform", "search_id", "min_advertisers", "active_only", "include_brands", "multi_platform", "scope", "sort"] as const;
const TYPED_KEYS = ["q", "min_advertisers"] as const;
const PANEL_KEYS = ["kind", "platform", "search_id", "min_advertisers"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "score", label: "Score de oferta" },
  { id: "platforms", label: "Em mais plataformas" },
  { id: "advertisers", label: "Mais anunciantes" },
  { id: "ads", label: "Mais anúncios" },
  { id: "creatives", label: "Mais criativos" },
  { id: "days_active", label: "Mais tempo no ar" },
  { id: "recent", label: "Descobertas recentemente" },
];

export function OffersView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [data, setData] = useState<OfferPage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  const { collections, reload: reloadCollections } = useCollections();
  useSlashFocus("oq");

  const platforms = data?.platforms ?? [];
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.kind) chips.push({ key: "kind", label: OFFER_KINDS.find((k) => k.id === filters.kind)?.label ?? filters.kind });
  if (filters.platform) chips.push({ key: "platform", label: filters.platform });
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }
  if (filters.min_advertisers) chips.push({ key: "min_advertisers", label: `≥ ${filters.min_advertisers} anunciantes` });

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<OfferPage>(`/api/offers${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
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
      const page = await api<OfferPage>(`/api/offers${toQuery({ ...filters, limit: PAGE_SIZE, offset: data.items.length })}`);
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
  if (loading) status = "Carregando ofertas...";
  else if (loadingMore) status = "Carregando mais ofertas...";
  else if (!error && total === 0) status = "Nenhuma oferta encontrada.";
  else if (!error && items.length < total) status = `Mostrando ${items.length.toLocaleString("pt-BR")} de ${count} ofertas.`;
  else if (!error) status = `${count} ${total === 1 ? "oferta encontrada" : "ofertas encontradas"}.`;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ofertas</h1>
        <p className="mt-1 text-sm text-muted">Produtos com mais anunciantes e anúncios rodando.</p>
      </div>

      <form
        role="search"
        aria-label="Filtros de ofertas"
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
            <label className="sr-only" htmlFor="oq">Buscar nas ofertas</label>
            <input id="oq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: link, anunciante ou texto" />
            {!draft.q && <SlashHint />}
          </div>
          <FilterToggle open={panelOpen} count={panelCount} controls="offers-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <MoreFilters open={panelOpen}>
            {!filters.search_id && <ScopeToggle value={filters.scope} onChange={(v) => update("scope", v)} />}
            <CheckToggle label="Somente ativos" checked={filters.active_only !== "false"}
              onChange={(on) => update("active_only", on ? "" : "false")} />
            <CheckToggle label="Incluir marcas grandes" checked={filters.include_brands === "true"}
              onChange={(on) => update("include_brands", on ? "true" : "")} />
            <CheckToggle label="Também no TikTok, YouTube ou ranking de sites" checked={filters.multi_platform === "true"}
              onChange={(on) => update("multi_platform", on ? "true" : "")} />
          </MoreFilters>
        </div>

        <div id="offers-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-4">
          <FilterSelect id="o-tipo" label="Tipo" value={filters.kind} onChange={(v) => update("kind", v)} options={OFFER_KINDS} />
          <FilterSelect id="o-plataforma" label="Plataforma" value={filters.platform} onChange={(v) => update("platform", v)}
            options={platforms.map((p) => ({ id: p, label: p }))} />
          <FilterSelect id="o-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={searches.map((s) => ({ id: String(s.id), label: `${s.term} (${s.country})` }))} />
          <div>
            <label className="label" htmlFor="min_adv">Mín. anunciantes</label>
            <input id="min_adv" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" className="field" value={draft.min_advertisers ?? ""}
              onChange={(e) => type("min_advertisers", digitsOnly(e.target.value))} placeholder="ex.: 2" />
          </div>
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
            {loading && !data ? "Carregando ofertas..." : `${count} ${total === 1 ? "oferta" : "ofertas"}`}
          </span>
          <SortSelect id="osort" value={filters.sort ?? "score"} options={SORTS}
            onChange={(v) => update("sort", v === "score" ? "" : v)} />
          <ExportCsv path="/api/offers/export.csv" filters={filters} disabled={loading || !!error || total === 0} className="ml-auto" />
        </div>
        {total > 0 && <ScoreLegend kind="offer" />}
        {!loading && <HiddenBrandsNote count={data?.hidden_brands ?? 0} noun="ofertas" onShow={() => update("include_brands", "true")} />}
      </div>

      {error && (
        <ErrorState action="carregar as ofertas" error={error} onRetry={() => setAttempt((n) => n + 1)} />
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhuma oferta com esses filtros." : (
            <>
              Nenhuma oferta nas suas buscas ainda. Colete anúncios em{" "}
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

      <div aria-busy={loading || loadingMore} className={`flex flex-col gap-3 transition-opacity ${loading && items.length > 0 ? "opacity-60" : ""}`}>
        {items.map((offer, i) => (
          <OfferRow key={offer.key} offer={offer} rank={i + 1} heat={data?.heat} collections={collections}
            onCollectionsChange={(ids) => {
              setData((d) => d && { ...d, items: d.items.map((o) => (o.key === offer.key ? { ...o, collection_ids: ids } : o)) });
              reloadCollections();
            }} />
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

type OfferRowProps = {
  offer: Offer;
  rank: number;
  heat?: ScoreHeat;
  collections: Collection[];
  onCollectionsChange: (ids: number[]) => void;
};

export function OfferRow({ offer, rank, heat, collections, onCollectionsChange }: OfferRowProps) {
  return (
    <article className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)_auto] xl:items-center xl:gap-x-5">
      <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:gap-3 xl:col-span-1">
        <div className="flex shrink-0 gap-1.5">
          {offer.previews.map((p, i) => (
            <Link key={p.creative_id} href={`/criativos/${p.creative_id}`}
              aria-label={`Criativo ${i + 1} da oferta ${offer.label}${p.media_type === "video" ? " (vídeo)" : ""}`}
              className="relative size-14 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:size-16">
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

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-xs text-muted">#{rank}</span>
            <h2 className="min-w-0 flex-1 truncate font-medium" title={offer.key}>{offer.label}</h2>
            <ScoreBadge value={offer.score} heat={heat}
              title="Score de oferta: anunciantes, anúncios, criativos, tempo no ar e +0,75 por plataforma extra" />
          </div>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0">{OFFER_KIND_LABEL[offer.kind]}</span>
            {offer.platform && (
              <span className="shrink-0 rounded-full border border-line px-2 text-micro text-foreground">{offer.platform}</span>
            )}
            {offer.url && (
              <a href={offer.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-foreground" title={offer.url}>
                {offer.url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            )}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <MetricStrip className="grid-cols-4">
          <Metric label="anunciantes" value={offer.advertisers} strong={topMetric(heat, "advertisers", offer.advertisers)} />
          <Metric label="anúncios" value={offer.ads} strong={topMetric(heat, "ads", offer.ads)} />
          <Metric label="criativos" value={offer.creatives} strong={topMetric(heat, "creatives", offer.creatives)} />
          <Metric label="dias no ar" value={offer.days_active} strong={topMetric(heat, "days_active", offer.days_active)} />
        </MetricStrip>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {offer.platforms > 1 && (
            <span title="A oferta aparece em mais de uma plataforma de anúncios"
              className="rounded-full border border-accent/60 px-2 py-0.5 text-micro font-semibold text-accent">
              {["Meta", offer.tiktok_ads > 0 && "TikTok", offer.videos > 0 && "YouTube"].filter(Boolean).join(" + ")}
            </span>
          )}
          {offer.site_rank != null && (
            <Link href={`/sites?q=${encodeURIComponent(offer.key)}&scope=all`}
              title={`O site da oferta está em #${offer.site_rank} no ranking "${offer.site_ranking}" do Cloudflare Radar`}
              className="text-accent hover:underline">
              Site #{offer.site_rank}
            </Link>
          )}
          {offer.videos > 0 && (
            <Link href={`/videos?offer=${encodeURIComponent(offer.key)}`} className="text-accent hover:underline">
              {offer.videos} {offer.videos === 1 ? "vídeo" : "vídeos"} no YouTube
            </Link>
          )}
          {offer.tiktok_ads > 0 && (
            <Link href={`/tiktok?offer=${encodeURIComponent(offer.key)}`} className="text-accent hover:underline">
              {offer.tiktok_ads} no TikTok
            </Link>
          )}
          {offer.top_advertisers.map((a) => (
            <Link key={a.page_id} href={`/anunciantes/${a.page_id}`} className="max-w-48 truncate hover:text-accent">
              {a.name ?? a.page_id} <span className="font-mono">({a.ads})</span>
            </Link>
          ))}
          {offer.advertisers > offer.top_advertisers.length && (
            <span>+{offer.advertisers - offer.top_advertisers.length}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <CollectionMenu target={{ offerKey: offer.key }} selected={offer.collection_ids} collections={collections}
          onChange={onCollectionsChange} />
        <Link href={`/criativos?offer=${encodeURIComponent(offer.key)}`} className="btn h-8 whitespace-nowrap text-xs pointer-coarse:h-11">
          Ver criativos
        </Link>
      </div>
    </article>
  );
}