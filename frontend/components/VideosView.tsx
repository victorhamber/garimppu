"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, timeAgo, toQuery, type ScoreHeat, type Search, type Video, type VideoPage } from "@/lib/api";
import { useNiches } from "@/lib/hooks";
import { digitsOnly, useUrlFilters } from "@/lib/useUrlFilters";
import { CoverImage, VideoFallback } from "./CoverImage";
import { CheckToggle, FilterChips, FilterSelect, FilterToggle, ScopeToggle, SlashHint, SortSelect, useSlashFocus, type FilterChip } from "./FilterBar";
import { HEAT_HINT, heatClass, ScoreLegend } from "./Metrics";

const PAGE_SIZE = 30;
const FILTER_KEYS = ["q", "niche", "search_id", "format", "period", "min_views", "has_offer", "offer", "scope", "sort"] as const;
const TYPED_KEYS = ["q", "min_views"] as const;
const PANEL_KEYS = ["niche", "search_id", "format", "period", "min_views"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const SORTS = [
  { id: "score", label: "Score de vídeo" },
  { id: "velocity", label: "Mais views por dia" },
  { id: "views", label: "Mais visualizações" },
  { id: "outlier", label: "Mais acima do canal" },
  { id: "engagement", label: "Mais engajamento" },
  { id: "acceleration", label: "Acelerando agora" },
  { id: "recent", label: "Publicados recentemente" },
];
const FORMATS = [
  { id: "short", label: "Shorts" },
  { id: "long", label: "Vídeos longos" },
];
const PERIODS = [
  { id: "1", label: "Últimas 24h" },
  { id: "3", label: "Últimos 3 dias" },
  { id: "7", label: "Últimos 7 dias" },
  { id: "30", label: "Últimos 30 dias" },
];

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatMultiple(value: number): string {
  if (value >= 10) return `${Math.round(value)}×`;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 1 ? 2 : 1 })}×`;
}

export function VideosView() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [data, setData] = useState<VideoPage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { filters, draft, hasFilters, type, set: update, flush, clear } = useUrlFilters(FILTER_KEYS, TYPED_KEYS);
  const [attempt, setAttempt] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const key = `${filtersKey}#${attempt}`;
  const loading = loadedKey !== key;
  const [panelOpen, setPanelOpen] = useState(false);
  const { niches, label } = useNiches();
  useSlashFocus("vq");

  const youtubeSearches = searches.filter((s) => s.source === "youtube");
  const panelCount = PANEL_KEYS.filter((k) => filters[k]).length;
  const chips: FilterChip<FilterKey>[] = [];
  if (filters.niche) chips.push({ key: "niche", label: label(filters.niche) ?? filters.niche });
  if (filters.search_id) {
    const search = searches.find((s) => String(s.id) === filters.search_id);
    chips.push({ key: "search_id", label: `Busca: ${search?.term ?? filters.search_id}` });
  }
  if (filters.format) chips.push({ key: "format", label: FORMATS.find((f) => f.id === filters.format)?.label ?? filters.format });
  if (filters.period) chips.push({ key: "period", label: PERIODS.find((p) => p.id === filters.period)?.label ?? `${filters.period} dias` });
  if (filters.min_views) chips.push({ key: "min_views", label: `≥ ${Number(filters.min_views).toLocaleString("pt-BR")} views` });
  if (filters.offer) chips.push({ key: "offer", label: `Oferta: ${filters.offer}` });

  useEffect(() => {
    api<Search[]>("/api/searches").then(setSearches).catch(() => setSearches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<VideoPage>(`/api/videos${toQuery({ ...JSON.parse(filtersKey), limit: PAGE_SIZE })}`)
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
      const page = await api<VideoPage>(`/api/videos${toQuery({ ...filters, limit: PAGE_SIZE, offset: data.items.length })}`);
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
  if (loading) status = "Carregando vídeos...";
  else if (loadingMore) status = "Carregando mais vídeos...";
  else if (!error && total === 0) status = "Nenhum vídeo encontrado.";
  else if (!error && items.length < total) status = `Mostrando ${items.length.toLocaleString("pt-BR")} de ${count} vídeos.`;
  else if (!error) status = `${count} ${total === 1 ? "vídeo encontrado" : "vídeos encontrados"}.`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vídeos em alta no YouTube</h1>
        <p className="mt-1 text-sm text-muted">Vídeos ganhando views mais rápido que o normal.</p>
      </div>

      {data && !data.enabled && (
        <p role="note" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground">
          A busca no YouTube ainda não está ativada neste servidor: falta configurar a chave da API do YouTube
          (<span className="font-mono">YOUTUBE_API_KEY</span>).
        </p>
      )}

      <form
        role="search"
        aria-label="Filtros de vídeos"
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
            <label className="sr-only" htmlFor="vq">Buscar nos vídeos</label>
            <input id="vq" type="search" enterKeyHint="search" className="field pr-9" value={draft.q ?? ""} aria-keyshortcuts="/"
              onChange={(e) => type("q", e.target.value)} placeholder="Buscar: título, canal, descrição ou link" />
            {!draft.q && <SlashHint />}
          </div>
          {!filters.search_id && <ScopeToggle value={filters.scope} onChange={(v) => update("scope", v)} />}
          <FilterToggle open={panelOpen} count={panelCount} controls="videos-panel" onToggle={() => setPanelOpen((v) => !v)} />
          <CheckToggle label="Só com link de oferta" checked={filters.has_offer === "true"}
            onChange={(on) => update("has_offer", on ? "true" : "")} />
        </div>

        <div id="videos-panel" hidden={!panelOpen} className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-5">
          <FilterSelect id="v-nicho" label="Nicho" value={filters.niche} onChange={(v) => update("niche", v)} options={niches} />
          <FilterSelect id="v-busca" label="Busca" value={filters.search_id} onChange={(v) => update("search_id", v)}
            options={youtubeSearches.map((s) => ({ id: String(s.id), label: `${s.term} (${s.country})` }))} />
          <FilterSelect id="v-formato" label="Formato" value={filters.format} onChange={(v) => update("format", v)} options={FORMATS} />
          <FilterSelect id="v-periodo" label="Publicado" value={filters.period} onChange={(v) => update("period", v)} options={PERIODS} />
          <div>
            <label className="label" htmlFor="min_views">Mín. visualizações</label>
            <input id="min_views" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" className="field" value={draft.min_views ?? ""}
              onChange={(e) => type("min_views", digitsOnly(e.target.value))} placeholder="ex.: 10000" />
          </div>
        </div>

        <FilterChips chips={chips} onRemove={(k) => update(k, "")} onClear={hasFilters ? clear : undefined} />
      </form>

      <p role="status" className="sr-only">{status}</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span aria-hidden="true" className={`whitespace-nowrap ${loading && data ? "opacity-60" : ""}`}>
            {loading && !data ? "Carregando vídeos..." : `${count} ${total === 1 ? "vídeo" : "vídeos"}`}
          </span>
          <SortSelect id="vsort" value={filters.sort ?? "score"} options={SORTS}
            onChange={(v) => update("sort", v === "score" ? "" : v)} />
        </div>
        {total > 0 && <ScoreLegend kind="video" />}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span title={error}>Não foi possível carregar os vídeos: o servidor do Garimppu não respondeu.</span>
          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center text-muted">
          {hasFilters ? "Nenhum vídeo com esses filtros." : (
            <>
              Nenhum vídeo nas suas buscas ainda. Crie uma busca com fonte YouTube em{" "}
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
        {items.map((video, i) => (
          <VideoCard key={video.id} video={video} rank={i + 1} heat={data?.heat} niche={label(video.niche)} />
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

/** Same parts as backend pipeline/video_score.py, so the card can show where the score comes from. */
function scoreParts(video: Video) {
  const accel = video.acceleration;
  return [
    { label: "views/dia", value: Math.log10(1 + video.velocity) },
    { label: "acima do canal", value: video.outlier != null ? Math.log10(1 + video.outlier) : null },
    { label: "engajamento", value: video.engagement != null ? 0.5 * Math.min(video.engagement / 0.05, 1.5) : null },
    { label: "aceleração", value: accel != null ? Math.max(Math.min(Math.log2(Math.max(accel, 0.01)) / 2, 1), -0.5) : null },
  ];
}

const fmtPart = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function VideoCard({ video, rank, heat, niche }: { video: Video; rank: number; heat?: ScoreHeat; niche: string | null }) {
  const duration = formatDuration(video.duration_s);
  const title = video.title || "Sem título";
  const accel = video.acceleration;
  const parts = scoreParts(video);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <a href={video.url} target="_blank" rel="noreferrer" className="relative block aspect-video bg-surface-2"
        aria-label={`Assistir no YouTube: ${title}`}>
        {video.thumbnail_url ? (
          <CoverImage src={video.thumbnail_url} alt="" className="h-full w-full object-cover" fallback={<VideoFallback compact />} />
        ) : (
          <VideoFallback compact />
        )}
        {video.is_short && (
          <span className="absolute left-2 top-2 rounded border border-line bg-background/85 px-1.5 py-0.5 text-micro text-foreground">Short</span>
        )}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-micro text-foreground">{duration}</span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <span className="pt-0.5 font-mono text-xs text-muted">#{rank}</span>
          <h2 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug" title={title}>
            <a href={video.url} target="_blank" rel="noreferrer" className="hover:text-accent">{title}</a>
          </h2>
          <span title={`Score de vídeo = ${parts.map((p) => `${p.label} ${fmtPart(p.value)}`).join(" + ")} (${HEAT_HINT})`}
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${heatClass(video.score, heat)}`}>
            {video.score.toFixed(2)}
          </span>
        </div>
        <p className="truncate text-xs text-muted">
          {video.channel_id ? (
            <a href={`https://www.youtube.com/channel/${video.channel_id}`} target="_blank" rel="noreferrer" className="hover:text-foreground">
              {video.channel_title ?? "Canal"}
            </a>
          ) : video.channel_title}
          {video.channel_subscribers != null && ` · ${compact.format(video.channel_subscribers)} inscritos`}
          {` · ${timeAgo(video.published_at)}`}
          {niche && ` · ${niche}`}
        </p>

        <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
          <Metric label="views" value={compact.format(video.views)} />
          <Metric label="por dia" value={compact.format(video.velocity)} strong={video.velocity >= 10_000} />
          <Metric label="x canal" value={video.outlier != null ? formatMultiple(video.outlier) : "—"}
            strong={(video.outlier ?? 0) >= 3} title="Visualizações ÷ inscritos do canal" />
          <Metric label="engaj." value={video.engagement != null ? `${(video.engagement * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
            strong={(video.engagement ?? 0) >= 0.05} title="(curtidas + 2×comentários) ÷ visualizações" />
        </dl>
        <p className="text-micro text-muted">
          Pontos: {parts.map((p) => `${p.label} ${fmtPart(p.value)}`).join(" · ")}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {accel != null ? (
            <span title="Views por dia desde a coleta anterior ÷ média desde a publicação"
              className={accel >= 1.2 ? "text-accent" : accel < 0.8 ? "text-muted" : "text-foreground"}>
              {accel >= 1.2 ? "Acelerando" : accel < 0.8 ? "Desacelerando" : "Ritmo estável"} {formatMultiple(accel)}
            </span>
          ) : (
            <span className="text-muted" title="A aceleração aparece a partir da segunda coleta, um dia depois">Aceleração na próxima coleta</span>
          )}
          {video.offer_key && (
            <Link href={`/?offer=${encodeURIComponent(video.offer_key)}`} title={`Ver anúncios desta oferta (${video.link_url ?? video.offer_key})`}
              className="ml-auto max-w-full truncate rounded-full border border-accent/40 px-2 py-0.5 text-micro text-accent hover:bg-accent/10">
              {video.offer_label ?? video.offer_key}
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
