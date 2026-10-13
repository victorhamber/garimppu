"use client";

import Link from "next/link";
import { BackLink } from "./BackLink";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, offerTag, timeAgo, toQuery, type CreativeFilters, type Offer, type OfferPage, type Scope, type Search } from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { OfferDossier } from "./OfferDossier";
import { digitsOnly, useUrlFilters } from "@/lib/useUrlFilters";
import { ConfirmMine } from "./ConfirmMine";
import { CreativeGrid } from "./CreativeGrid";
import { CheckToggle, FilterChips, FilterSelect, FirstRunNote, FilterToggle, MoreFilters, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
const FILTER_KEYS: (keyof CreativeFilters)[] = [
  "q", "search_id", "offer", "country", "niche", "media_type", "min_days", "min_duplicates", "active_only",
  "include_brands", "scope", "sort",
];

const TYPED_KEYS: (keyof CreativeFilters)[] = ["q", "min_days", "min_duplicates"];

const PANEL_KEYS: (keyof CreativeFilters)[] = ["search_id", "niche", "media_type", "min_days", "min_duplicates"];

const MEDIA_OPTIONS = [{ id: "image", label: "Imagem" }, { id: "video", label: "Vídeo" }, { id: "text", label: "Só texto" }];
const SORTS = [
  { id: "score", label: "Score de escala" },
  { id: "duplicates", label: "Mais duplicados" },
  { id: "days_active", label: "Mais tempo ativo" },
  { id: "growth", label: "Maior crescimento 7d" },
  { id: "recent", label: "Descobertos recentemente" },
];

export function Explorer() {
  const router = useRouter();
  const { niches, label: nicheLabel } = useNiches();
  const [searches, setSearches] = useState<Search[]>([]);
  const { collections, reload: reloadCollections } = useCollections();
  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
  }, []);

  const [hasHistory, setHasHistory] = useState(false);
  const [scope, setScope] = useState<Scope>();
  const sorts = SORTS.filter((s) => s.id !== "growth" || hasHistory || filters.sort === "growth");

  const [offerInfo, setOfferInfo] = useState<{ key: string; offer: Offer | null } | null>(null);
  useEffect(() => {
    if (!filters.offer) return;
    const key = filters.offer;
    api<OfferPage>(`/api/offers${toQuery({ key, active_only: "false", limit: 1 })}`)
      .then((page) => setOfferInfo({ key, offer: page.items[0] ?? null }))
      .catch(() => setOfferInfo({ key, offer: null }));
  }, [filters.offer]);
  const offerResolved = !!filters.offer && offerInfo?.key === filters.offer;
  const offer = offerResolved ? offerInfo!.offer : null;
  const offerName = offer?.label ?? (offerResolved ? filters.offer : null);

  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;

  const chips: FilterChip<keyof CreativeFilters>[] = [];
  if (filters.offer) {
    chips.push({ key: "offer", label: `Oferta: ${offer ? `${offerName} · ${offerTag(offer)}` : (offerName ?? "…")}`, title: filters.offer });
  }
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }
  if (filters.niche) chips.push({ key: "niche", label: nicheLabel(filters.niche) ?? filters.niche });
  if (filters.media_type) {
    chips.push({ key: "media_type", label: MEDIA_OPTIONS.find((m) => m.id === filters.media_type)?.label ?? filters.media_type });
  }
  if (filters.min_days) chips.push({ key: "min_days", label: `≥ ${filters.min_days} dias ativo` });
  if (filters.min_duplicates) chips.push({ key: "min_duplicates", label: `≥ ${filters.min_duplicates} anúncios` });
  const [panelOpen, setPanelOpen] = useState(false);
  useSlashFocus("q");

  const scopedSearches = filters.search_id ? searches.filter((s) => String(s.id) === filters.search_id) : searches;
  const lastRun = scopedSearches.map((s) => s.last_run_at).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const lastRunAgo = timeAgo(lastRun);

  async function mineTerm(term: string) {
    await api("/api/searches", { method: "POST", body: JSON.stringify({ term, country: "BR" }) });
    router.push("/buscas");
  }

  let emptyMessage: React.ReactNode;
  if (filters.q) {
    const term = filters.q.trim();
    emptyMessage = (
      <div className="flex flex-col items-center gap-3">
        <p>
          Nenhum criativo já coletado contém <span className="text-foreground">&quot;{term}&quot;</span>.
          Este filtro só procura nos anúncios que você já minerou.
        </p>
        <ConfirmMine
          key={term}
          label={`Minerar "${term}" na Biblioteca`}
          consequence={`Cria a busca "${term}" e coleta até 300 anúncios ativos no Brasil da Biblioteca de Anúncios da Meta. A coleta roda em segundo plano e leva alguns minutos; você acompanha em Minerar.`}
          onConfirm={() => mineTerm(term)}
        />
      </div>
    );
  } else if (hasFilters) {
    emptyMessage = "Nenhum criativo encontrado com esses filtros.";
  } else {
    emptyMessage = (
      <>
        Nenhum criativo nas suas buscas ainda. Crie uma busca em{" "}
        <Link href="/buscas" className="text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent">Minerar</Link>{" "}
        ou veja{" "}
        <button type="button" onClick={() => update("scope", "all")}
          className="text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent">
          toda a base
        </button>.
      </>
    );
  }
  const scoped = !filters.offer && !filters.search_id;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {filters.offer && offer ? (
        <OfferDossier offer={offer} collections={collections}
          onCollectionsChange={(ids) => {
            setOfferInfo((info) => info?.offer ? { ...info, offer: { ...info.offer, collection_ids: ids } } : info);
            reloadCollections();
          }} />
      ) : filters.offer ? (
        <div>
          <BackLink href="/">Ofertas</BackLink>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
            Criativos da oferta {offerName && <span className="break-all">{offerName}</span>}
          </h1>
          {!offerResolved && <p role="status" className="mt-1 text-sm text-muted">Carregando a oferta...</p>}
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Criativos</h1>
          <p className="mt-1 text-sm text-muted">
            Anúncios do Meta que mais estão escalando.{lastRunAgo && ` Última coleta ${lastRunAgo}.`}
          </p>
        </div>
      )}
      <FirstRunNote show={scoped && !filters.scope && scope === "all"} />

      <form
        role="search"
        aria-label="Filtros de criativos"
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
            <label className="sr-only" htmlFor="q">Buscar nos anúncios minerados</label>
            <input id="q" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: texto, anunciante ou site" />
            {!draft.q && <SlashHint />}
          </div>
          <FilterToggle open={panelOpen} count={panelCount} controls="explorer-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <MoreFilters open={panelOpen}>
            {scoped && <ScopeToggle value={filters.scope} effective={scope} onChange={(v) => update("scope", v)} />}
            <CheckToggle label="Somente ativos" checked={filters.active_only !== "false"}
              onChange={(on) => update("active_only", on ? "" : "false")} />
            {!filters.offer && (
              <CheckToggle label="Incluir marcas grandes" checked={filters.include_brands === "true"}
                onChange={(on) => update("include_brands", on ? "true" : "")} />
            )}
          </MoreFilters>
        </div>

        <div id="explorer-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-5">
          <FilterSelect id="f-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={searches.map((s) => ({ id: String(s.id), label: `${s.term} (${s.country})` }))} />
          <FilterSelect id="f-nicho" label="Nicho" value={filters.niche} onChange={(v) => update("niche", v)} options={niches} />
          <FilterSelect id="f-midia" label="Mídia" value={filters.media_type} onChange={(v) => update("media_type", v)} options={MEDIA_OPTIONS} />
          <div>
            <label className="label" htmlFor="min_days">Mín. dias ativo</label>
            <input id="min_days" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" className="field" value={draft.min_days ?? ""}
              onChange={(e) => type("min_days", digitsOnly(e.target.value))} placeholder="ex.: 30" />
          </div>
          <div>
            <label className="label" htmlFor="min_dup">Mín. anúncios</label>
            <input id="min_dup" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" className="field" value={draft.min_duplicates ?? ""}
              onChange={(e) => type("min_duplicates", digitsOnly(e.target.value))} placeholder="ex.: 5" />
          </div>
        </div>

        <FilterChips chips={chips} onRemove={(key) => update(key, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <CreativeGrid
        filters={filters}
        emptyMessage={emptyMessage}
        onHistoryChange={setHasHistory}
        onScopeChange={setScope}
        onShowBrands={() => update("include_brands", "true")}
        toolbar={
          <SortSelect id="sort" value={filters.sort ?? "score"} options={sorts}
            onChange={(v) => update("sort", v === "score" ? "" : v)} />
        }
      />
    </div>
  );
}
