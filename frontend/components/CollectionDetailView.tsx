"use client";

import { BackLink } from "./BackLink";
import { useParams } from "next/navigation";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  api,
  toQuery,
  type Collection,
  type KeywordPage,
  type OfferPage,
  type SitePage,
  type TikTokAdPage,
  type VideoPage,
} from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { CreativeGrid } from "./CreativeGrid";
import { ErrorState } from "./ErrorState";
import { KeywordRow } from "./KeywordsView";
import { OfferRow } from "./OffersView";
import { SiteRow } from "./SitesView";
import { TikTokCard } from "./TikTokView";
import { VideoCard } from "./VideosView";

const SAVED_LIMIT = 200;

type Page = { items: { collection_ids: number[] }[] };

/** One saved list of the collection; null until loaded or when the request fails, with the reason in `error`. */
function useSavedPage<P>(path: string, id: string, attempt: number, extra: Record<string, string> = {}) {
  const [page, setPage] = useState<P | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = toQuery({ ...extra, collection_id: id, scope: "all", limit: SAVED_LIMIT });
  useEffect(() => {
    let cancelled = false;
    api<P>(`${path}${query}`)
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path, query, attempt]);
  return [page, setPage, error] as const;
}

/** Updates an item's collections; drops it from the page once it leaves this collection. */
function applySaved<P extends Page>(
  setPage: Dispatch<SetStateAction<P | null>>,
  collectionId: number,
  match: (item: P["items"][number]) => boolean,
  ids: number[],
) {
  setPage((page) => page && {
    ...page,
    items: ids.includes(collectionId)
      ? page.items.map((item) => (match(item) ? { ...item, collection_ids: ids } : item))
      : page.items.filter((item) => !match(item)),
  });
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function CollectionDetailView() {
  const { id } = useParams<{ id: string }>();
  const collectionId = Number(id);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { collections, reload } = useCollections();
  const { label } = useNiches();

  const [offers, setOffers, offersError] = useSavedPage<OfferPage>("/api/offers", id, attempt, { active_only: "false" });
  const [videos, setVideos, videosError] = useSavedPage<VideoPage>("/api/videos", id, attempt);
  const [tiktok, setTikTok, tiktokError] = useSavedPage<TikTokAdPage>("/api/tiktok/ads", id, attempt);
  const [sites, setSites, sitesError] = useSavedPage<SitePage>("/api/sites", id, attempt, { active_only: "false" });
  const [keywords, setKeywords, keywordsError] = useSavedPage<KeywordPage>("/api/keywords", id, attempt);
  const error = collectionError ?? offersError ?? sitesError ?? videosError ?? tiktokError ?? keywordsError;

  useEffect(() => {
    let cancelled = false;
    api<Collection>(`/api/collections/${id}`)
      .then((c) => {
        if (cancelled) return;
        setCollection(c);
        setCollectionError(null);
      })
      .catch((e: Error) => !cancelled && setCollectionError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (collection?.name) document.title = `${collection.name} · Garimppu`;
  }, [collection?.name]);

  const offerItems = offers?.items ?? [];
  const videoItems = videos?.items ?? [];
  const tiktokItems = tiktok?.items ?? [];
  const siteItems = sites?.items ?? [];
  const keywordItems = keywords?.items ?? [];
  const hasOthers = offerItems.length + videoItems.length + tiktokItems.length + siteItems.length + keywordItems.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/colecoes">Coleções</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">{collection?.name ?? "Coleção"}</h1>
      {error && (
        <ErrorState action={collectionError ? "abrir a coleção" : "carregar parte da coleção"} error={error}
          onRetry={() => setAttempt((n) => n + 1)} backHref="/colecoes" />
      )}

      {offerItems.length > 0 && (
        <Section id="col-offers" title="Ofertas">
          {offerItems.map((offer, i) => (
            <OfferRow key={offer.key} offer={offer} rank={i + 1} heat={offers?.heat} collections={collections}
              onCollectionsChange={(ids) => {
                applySaved(setOffers, collectionId, (o) => o.key === offer.key, ids);
                reload();
              }} />
          ))}
        </Section>
      )}

      {siteItems.length > 0 && (
        <Section id="col-sites" title="Sites de venda">
          <ol className="flex flex-col gap-3">
            {siteItems.map((site, i) => (
              <li key={site.domain}>
                <SiteRow site={site} rank={i + 1} nicheLabel={label(site.niche)} heat={sites?.heat} collections={collections}
                  onCollectionsChange={(ids) => {
                    applySaved(setSites, collectionId, (s) => s.domain === site.domain, ids);
                    reload();
                  }} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {videoItems.length > 0 && (
        <Section id="col-videos" title="Vídeos do YouTube">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {videoItems.map((video, i) => (
              <VideoCard key={video.id} video={video} rank={i + 1} heat={videos?.heat} niche={label(video.niche)}
                collections={collections}
                onCollectionsChange={(ids) => {
                  applySaved(setVideos, collectionId, (v) => v.id === video.id, ids);
                  reload();
                }} />
            ))}
          </div>
        </Section>
      )}

      {tiktokItems.length > 0 && (
        <Section id="col-tiktok" title="Anúncios do TikTok">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tiktokItems.map((ad, i) => (
              <TikTokCard key={ad.id} ad={ad} rank={i + 1} heat={tiktok?.heat} collections={collections}
                onCollectionsChange={(ids) => {
                  applySaved(setTikTok, collectionId, (a) => a.id === ad.id, ids);
                  reload();
                }} />
            ))}
          </div>
        </Section>
      )}

      {keywordItems.length > 0 && (
        <Section id="col-keywords" title="Palavras-chave">
          <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {keywordItems.map((keyword) => (
              <KeywordRow key={keyword.id} keyword={keyword} heat={keywords?.heat} nicheLabel={label(keyword.niche)}
                collections={collections}
                onCollectionsChange={(ids) => {
                  applySaved(setKeywords, collectionId, (k) => k.id === keyword.id, ids);
                  reload();
                }} />
            ))}
          </ol>
        </Section>
      )}

      <section aria-labelledby={hasOthers ? "col-creatives" : undefined} className="flex flex-col gap-3">
        {hasOthers && <h2 id="col-creatives" className="text-lg font-semibold">Criativos</h2>}
        <CreativeGrid
          filters={{ collection_id: id, active_only: "false" }}
          heading={!hasOthers}
          emptyMessage={hasOthers ? "Nenhum criativo nesta coleção."
            : collection?.name === "Favoritos" ? "Nada salvo ainda. A estrela de qualquer card salva aqui."
            : `Nada salvo ainda. Na seta ao lado da estrela de qualquer card, escolha "${collection?.name ?? "esta coleção"}".`}
        />
      </section>
    </div>
  );
}
