"use client";

import Link from "next/link";
import { offerTag, type Collection, type Creative, type ScoreHeat } from "@/lib/api";
import { CollectionMenu } from "./CollectionMenu";
import { CreativeMedia } from "./CreativeMedia";
import { MetricRow, Platforms, scorePhrase, ScoreBadge } from "./Metrics";

type Props = {
  creative: Creative;
  rank: number;
  heat: ScoreHeat | null;
  collections: Collection[];
  nicheLabel: (id: string | null) => string | null;
  onCollectionsChange: (ids: number[]) => void;
};

/** The item's one link to its detail page; the thumbnail repeats it for the mouse only, so Tab stops here once. */
function Title({ creative, rank }: Pick<Props, "creative" | "rank">) {
  const advertiser = creative.page?.name ?? creative.page?.page_id;
  const kind = creative.media_type === "video" ? "Vídeo" : creative.media_type === "image" ? "Imagem" : "Anúncio só texto";
  return (
    <h3 className="min-w-0 truncate text-sm font-medium" title={advertiser ?? undefined}>
      <Link href={`/criativos/${creative.id}`} className={`hover:text-accent ${advertiser ? "" : "text-muted"}`}>
        <span className="sr-only">{kind} #{rank} de </span>
        {advertiser ?? "Anunciante desconhecido"}
        <span className="sr-only">, {scorePhrase(creative.score?.score ?? 0)}</span>
      </Link>
    </h3>
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

function Save({ creative, rank, collections, onCollectionsChange }: Pick<Props, "creative" | "rank" | "collections" | "onCollectionsChange">) {
  return (
    <CollectionMenu
      target={{ creativeId: creative.id }}
      selected={creative.collection_ids}
      collections={collections}
      onChange={onCollectionsChange}
      itemName={`o criativo #${rank} de ${creative.page?.name ?? creative.page?.page_id ?? "anunciante desconhecido"}`}
    />
  );
}

export function CreativeCard({ creative, rank, heat, collections, nicheLabel, onCollectionsChange }: Props) {
  return (
    <li className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-muted/60">
      <Link href={`/criativos/${creative.id}`} tabIndex={-1} aria-hidden="true"
        className="relative block aspect-square overflow-hidden bg-surface-2">
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
          <Title creative={creative} rank={rank} />
          <MetaLine niche={nicheLabel(creative.niche)} platforms={creative.platforms} bigBrand={creative.page?.big_brand} />
        </div>

        <MetricRow score={creative.score} heat={heat} hasHistory={creative.has_history} />

        <OfferLine creative={creative} />

        <p className="line-clamp-2 text-sm leading-normal text-muted">{creative.body ?? creative.title ?? "Sem texto"}</p>

        <div className="mt-auto flex justify-end pt-1">
          <Save creative={creative} rank={rank} collections={collections} onCollectionsChange={onCollectionsChange} />
        </div>
      </div>
    </li>
  );
}

/** Compact view: one scan line per creative, same signals in the same order as the card. */
export function CreativeRow({ creative, rank, heat, collections, nicheLabel, onCollectionsChange }: Props) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2 transition-colors hover:border-muted/60 sm:gap-4">
      <span className="hidden w-8 shrink-0 text-right font-mono text-xs text-muted tabular-nums sm:block" aria-hidden="true">#{rank}</span>
      <Link href={`/criativos/${creative.id}`} tabIndex={-1} aria-hidden="true"
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
          <Title creative={creative} rank={rank} />
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
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
        <ScoreBadge value={creative.score?.score ?? 0} heat={heat} />
        <Save creative={creative} rank={rank} collections={collections} onCollectionsChange={onCollectionsChange} />
      </div>
    </li>
  );
}
