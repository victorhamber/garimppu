"use client";

import Link from "next/link";
import { offerTag, type Collection, type Creative, type ScoreHeat } from "@/lib/api";
import { CollectionMenu } from "./CollectionMenu";
import { CreativeMedia } from "./CreativeMedia";
import { MetricRow, Platforms, ScoreBadge } from "./Metrics";

type Props = {
  creative: Creative;
  rank: number;
  heat: ScoreHeat | null;
  collections: Collection[];
  nicheLabel: (id: string | null) => string | null;
  onCollectionsChange: (ids: number[]) => void;
};

function mediaName(creative: Creative, rank: number) {
  const advertiser = creative.page?.name ?? creative.page?.page_id;
  const kind = creative.media_type === "video" ? "Vídeo" : creative.media_type === "image" ? "Imagem" : "Anúncio só texto";
  const score = (creative.score?.score ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${kind} #${rank}${advertiser ? ` de ${advertiser}` : ""}, score ${score}: ver detalhes`;
}

function Advertiser({ creative }: { creative: Creative }) {
  return creative.page ? (
    <Link
      href={`/anunciantes/${creative.page.page_id}`}
      className="min-w-0 truncate text-sm font-medium hover:text-accent"
      title={creative.page.name ?? undefined}
    >
      {creative.page.name ?? creative.page.page_id}
    </Link>
  ) : (
    <span className="text-sm text-muted">Anunciante desconhecido</span>
  );
}

function MetaLine({ niche, platforms, bigBrand }: { niche: string | null; platforms: string[]; bigBrand?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
      {bigBrand && (
        <span className="shrink-0 rounded border border-line px-1.5 text-micro text-foreground"
          title="Marca grande: afiliados não podem promovê-la">
          Marca grande
        </span>
      )}
      {niche && <span className="min-w-0 truncate" title={niche}>{niche}</span>}
      <Platforms platforms={platforms} />
    </div>
  );
}

function OfferLine({ creative }: { creative: Creative }) {
  if (!creative.offer) return null;
  return (
    <Link
      href={`/?offer=${encodeURIComponent(creative.offer.key)}`}
      className="-my-1 flex min-w-0 items-center gap-2 rounded-md py-1 text-xs text-muted transition-colors hover:text-foreground pointer-coarse:min-h-11"
      title={`Ver criativos da oferta ${creative.offer.label}`}
    >
      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-micro text-foreground">
        {offerTag(creative.offer)}
      </span>
      <span className="truncate">{creative.offer.label}</span>
    </Link>
  );
}

function Actions({ creative, collections, onCollectionsChange, external = true }: Pick<Props, "creative" | "collections" | "onCollectionsChange"> & { external?: boolean }) {
  return (
    <div className="flex shrink-0 items-center">
      {external && creative.library_url && (
        <a href={creative.library_url} target="_blank" rel="noreferrer" title="Abrir na Biblioteca de Anúncios" className="btn btn-ghost h-8 px-2 text-xs text-muted pointer-coarse:h-11">
          Biblioteca
        </a>
      )}
      {external && creative.link_url && (
        <a href={creative.link_url} target="_blank" rel="noreferrer" title={creative.link_url} className="btn btn-ghost h-8 px-2 text-xs text-muted pointer-coarse:h-11">
          Página
        </a>
      )}
      <CollectionMenu
        target={{ creativeId: creative.id }}
        selected={creative.collection_ids}
        collections={collections}
        onChange={onCollectionsChange}
      />
    </div>
  );
}

export function CreativeCard({ creative, rank, heat, collections, nicheLabel, onCollectionsChange }: Props) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-muted/60">
      <Link href={`/criativos/${creative.id}`} aria-label={mediaName(creative, rank)}
        className="relative block aspect-square overflow-hidden bg-surface-2 focus-visible:-outline-offset-2">
        <CreativeMedia creative={creative} className="transition-transform duration-300 motion-safe:group-hover:scale-[1.02]" />
        <span className="absolute top-2 left-2 rounded border border-line bg-background/85 px-1.5 py-0.5 font-mono text-xs text-foreground tabular-nums">#{rank}</span>
        <span className="absolute top-2 right-2">
          <ScoreBadge value={creative.score?.score ?? 0} heat={heat} />
        </span>
        {creative.media_type === "video" && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded border border-line bg-background/85 px-1.5 py-0.5 text-xs text-foreground">
            <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            vídeo
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Advertiser creative={creative} />
          <MetaLine niche={nicheLabel(creative.niche)} platforms={creative.platforms} bigBrand={creative.page?.big_brand} />
        </div>

        <MetricRow score={creative.score} heat={heat} hasHistory={creative.has_history} />

        <OfferLine creative={creative} />

        <p className="line-clamp-2 text-sm leading-normal text-muted">{creative.body ?? creative.title ?? "Sem texto"}</p>

        <div className="mt-auto flex justify-end pt-1">
          <Actions creative={creative} collections={collections} onCollectionsChange={onCollectionsChange} />
        </div>
      </div>
    </article>
  );
}

/** Compact view: one scan line per creative, same signals in the same order as the card. */
export function CreativeRow({ creative, rank, heat, collections, nicheLabel, onCollectionsChange }: Props) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2 transition-colors hover:border-muted/60 sm:gap-4">
      <span className="hidden w-8 shrink-0 text-right font-mono text-xs text-muted tabular-nums sm:block" aria-hidden="true">#{rank}</span>
      <Link href={`/criativos/${creative.id}`} aria-label={mediaName(creative, rank)}
        className="relative size-14 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:size-16">
        <CreativeMedia creative={creative} compact />
        {creative.media_type === "video" && (
          <span className="absolute bottom-0.5 left-0.5 rounded bg-background/85 p-0.5 text-foreground" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-2.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs text-muted tabular-nums sm:hidden" aria-hidden="true">#{rank}</span>
          <Advertiser creative={creative} />
        </div>
        <MetaLine niche={nicheLabel(creative.niche)} platforms={creative.platforms} bigBrand={creative.page?.big_brand} />
        {creative.score && (
          <span className="text-xs text-muted md:hidden">
            <span className="font-mono tabular-nums text-foreground">{creative.score.duplicates}</span> anúncios ·{" "}
            <span className="font-mono tabular-nums text-foreground">{creative.score.days_active}</span> dias ativo
          </span>
        )}
        <div className="hidden min-w-0 lg:block">
          <OfferLine creative={creative} />
        </div>
      </div>

      <div className="hidden w-60 shrink-0 md:block">
        <MetricRow score={creative.score} heat={heat} hasHistory={creative.has_history} />
      </div>
      <span className="shrink-0">
        <ScoreBadge value={creative.score?.score ?? 0} heat={heat} />
      </span>
      <span className="hidden sm:block">
        <Actions creative={creative} collections={collections} onCollectionsChange={onCollectionsChange} external={false} />
      </span>
    </article>
  );
}
