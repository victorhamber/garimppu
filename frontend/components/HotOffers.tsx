"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mediaUrl, offerTag, toQuery, type OfferPage } from "@/lib/api";
import { CoverImage, VideoFallback } from "./CoverImage";
import { heatClass } from "./Metrics";

const LIMIT = 5;

type Props = { q?: string; searchId?: string; activeOnly?: string; includeBrands?: string; scope?: string };

/** Top offers for the same slice of data the explorer is showing; conversation offers have no product to model. */
export function HotOffers({ q, searchId, activeOnly, includeBrands, scope }: Props) {
  const query = toQuery({
    q, search_id: searchId, active_only: activeOnly, include_brands: includeBrands, scope, exclude_kind: "conversa", limit: LIMIT,
  });
  const [loaded, setLoaded] = useState<{ query: string; page: OfferPage | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<OfferPage>(`/api/offers${query}`)
      .then((page) => !cancelled && setLoaded({ query, page }))
      .catch(() => !cancelled && setLoaded({ query, page: null }));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const page = loaded?.query === query ? loaded.page : null;
  if (loaded && loaded.query === query && (!page || page.items.length === 0)) return null;

  const allHref = `/ofertas${toQuery({ q, search_id: searchId, include_brands: includeBrands, scope })}`;

  return (
    <section aria-labelledby="hot-offers" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="hot-offers" className="text-lg font-semibold">Ofertas em alta</h2>
        <Link href={allHref} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
          Ver todas as ofertas
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <ol className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5">
        {page
          ? page.items.map((offer) => {
              const preview = offer.previews.find((p) => p.image);
              return (
                <li key={offer.key} className="w-64 shrink-0 snap-start md:w-auto">
                  <Link
                    href={`/?offer=${encodeURIComponent(offer.key)}`}
                    className="flex h-full gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-muted/60 focus-visible:-outline-offset-2"
                  >
                    <span className="size-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {preview?.image && (
                        <CoverImage src={mediaUrl(preview.image)!} alt="" className="h-full w-full object-cover"
                          fallback={<VideoFallback compact />} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium" title={offer.label}>{offer.label}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${heatClass(offer.score, page.heat)}`}>
                          {offer.score.toFixed(2)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted">{offerTag(offer)}</span>
                      <span className="text-xs text-muted">
                        <span className={`font-mono tabular-nums ${offer.advertisers >= 2 ? "text-accent" : "text-foreground"}`}>
                          {offer.advertisers}
                        </span>{" "}
                        {offer.advertisers === 1 ? "anunciante" : "anunciantes"} ·{" "}
                        <span className="font-mono tabular-nums text-foreground">{offer.ads}</span> anúncios
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })
          : Array.from({ length: LIMIT }, (_, i) => (
              <li key={i} className="h-[78px] w-64 shrink-0 rounded-lg border border-line bg-surface md:w-auto" aria-hidden="true" />
            ))}
      </ol>
    </section>
  );
}
