"use client";

import { useEffect, useState } from "react";
import { api, toQuery, type Creative, type CreativeFilters, type CreativePage, type ScoreHeat } from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { useViewPreference, type GridView } from "@/lib/useViewPreference";
import { CreativeCard, CreativeRow } from "./CreativeCard";
import { ExportCsv } from "./ExportCsv";
import { HiddenBrandsNote } from "./FilterBar";
import { ScoreLegend } from "./Metrics";

const PAGE_SIZE = 48;

type Props = {
  filters: CreativeFilters;
  emptyMessage?: React.ReactNode;
  onHistoryChange?: (hasHistory: boolean) => void;
  /** Result-level controls shown beside the count (e.g. sort). */
  toolbar?: React.ReactNode;
  /** Offered when big brands were left out of the result. */
  onShowBrands?: () => void;
};

const VIEWS: { id: GridView; label: string; icon: React.ReactNode }[] = [
  {
    id: "grid",
    label: "Grade",
    icon: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  },
  {
    id: "list",
    label: "Lista compacta",
    icon: <path d="M4 5h4v4H4zM10 6h10M4 15h4v4H4zM10 16h10" />,
  },
];

export function CreativeGrid({ filters, emptyMessage, onHistoryChange, toolbar, onShowBrands }: Props) {
  const [view, setView] = useViewPreference();
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [items, setItems] = useState<Creative[]>([]);
  const [total, setTotal] = useState(0);
  const [heat, setHeat] = useState<ScoreHeat | null>(null);
  const [hiddenBrands, setHiddenBrands] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { collections, reload: reloadCollections } = useCollections();
  const { label } = useNiches();
  const refetching = loadedKey !== key;
  const loading = refetching || loadingMore;

  useEffect(() => {
    let cancelled = false;
    api<CreativePage>(`/api/creatives${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTotal(page.total);
        setHeat(page.heat);
        setHiddenBrands(page.hidden_brands);
        setError(null);
        onHistoryChange?.(page.has_history);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setHiddenBrands(0);
        setError(e.message);
      })
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when filters or retry change
  }, [key, filtersKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await api<CreativePage>(
        `/api/creatives${toQuery({ ...filters, limit: PAGE_SIZE, offset: items.length })}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function updateCollections(creativeId: number, ids: number[]) {
    setItems((prev) => prev.map((c) => (c.id === creativeId ? { ...c, collection_ids: ids } : c)));
    reloadCollections();
  }

  const canExport = !refetching && !error && total > 0;
  const count = total.toLocaleString("pt-BR");

  let status = "";
  if (refetching) status = "Carregando criativos...";
  else if (loadingMore) status = "Carregando mais criativos...";
  else if (!error && total === 0) status = "Nenhum criativo encontrado.";
  else if (!error && items.length < total) status = `Mostrando ${items.length.toLocaleString("pt-BR")} de ${count} criativos.`;
  else if (!error) status = `${count} ${total === 1 ? "criativo encontrado" : "criativos encontrados"}.`;

  return (
    <section className="flex flex-col gap-4">
      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span aria-hidden="true" className={`whitespace-nowrap ${refetching && items.length > 0 ? "opacity-60" : ""}`}>
              {refetching && items.length === 0 ? "Carregando criativos..." : `${count} ${total === 1 ? "criativo" : "criativos"}`}
            </span>
            {toolbar}
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Vista" className="flex rounded-md border border-line p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  aria-label={v.label}
                  title={v.label}
                  onClick={() => setView(v.id)}
                  className={`flex h-7 w-8 items-center justify-center rounded transition-colors pointer-coarse:h-10 pointer-coarse:w-10 ${view === v.id ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {v.icon}
                  </svg>
                </button>
              ))}
            </div>
            <ExportCsv path="/api/creatives/export.csv" filters={filters} disabled={!canExport} />
          </div>
        </div>
        {total > 0 && <ScoreLegend />}
        {onShowBrands && !refetching && <HiddenBrandsNote count={hiddenBrands} noun="criativos" onShow={onShowBrands} />}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span title={error}>Não foi possível carregar os criativos: o servidor do Garimppu não respondeu.</span>
          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {emptyMessage ?? "Nenhum criativo encontrado com esses filtros."}
        </div>
      )}

      <div
        aria-busy={loading}
        className={`${view === "list" ? "flex flex-col gap-2" : "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4"} transition-opacity ${refetching && items.length > 0 ? "opacity-60" : ""}`}
      >
        {items.map((creative, i) => {
          const Item = view === "list" ? CreativeRow : CreativeCard;
          return (
            <Item
              key={creative.id}
              creative={creative}
              rank={i + 1}
              heat={heat}
              collections={collections}
              nicheLabel={label}
              onCollectionsChange={(ids) => updateCollections(creative.id, ids)}
            />
          );
        })}
      </div>

      {items.length < total && (
        <button type="button" onClick={loadMore} disabled={loading} className="btn mx-auto">
          {loadingMore ? "Carregando..." : `Carregar mais (${total - items.length} restantes)`}
        </button>
      )}
    </section>
  );
}
