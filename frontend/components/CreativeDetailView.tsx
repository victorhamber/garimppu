"use client";

/* eslint-disable @next/next/no-img-element -- page avatars come from Meta's CDN */
import Link from "next/link";
import { BackLink } from "./BackLink";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api, formatDate, formatDateTime, OFFER_OPEN_LABEL, offerTag, PLATFORM_LABELS, type CreativeDetail,
} from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { CollectionMenu } from "./CollectionMenu";
import { CreativeMedia } from "./CreativeMedia";
import { DownloadMedia } from "./DownloadMedia";
import { ErrorState } from "./ErrorState";
import { ExternalIcon } from "./ExternalIcon";
import { formatGrowth, ScoreBadge } from "./Metrics";
import { Sparkline } from "./Sparkline";

const block = "rounded bg-surface-2 motion-safe:animate-pulse";

/** Same frame as the loaded page (media left, header and stats right) so nothing jumps when it arrives. */
function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">Carregando criativo...</p>
      <div aria-hidden="true" className={`h-5 w-40 ${block}`} />
      <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className={`aspect-square rounded-lg ${block}`} />
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-full ${block}`} />
            <div className="flex flex-1 flex-col gap-2">
              <div className={`h-7 w-1/2 ${block}`} />
              <div className={`h-4 w-1/3 ${block}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 md:grid-cols-5 lg:max-xl:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-2 bg-surface px-4 py-3">
                <div className={`h-3 w-2/3 ${block}`} />
                <div className={`h-6 w-1/3 ${block}`} />
              </div>
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex h-44 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                <div className={`h-3 w-1/4 ${block}`} />
                <div className={`h-4 w-full ${block}`} />
                <div className={`h-4 w-4/5 ${block}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreativeDetailView() {
  const { id } = useParams<{ id: string }>();
  const [creative, setCreative] = useState<CreativeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { collections, reload } = useCollections();
  const { label } = useNiches();

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<CreativeDetail>(`/api/creatives/${id}`)
      .then((c) => {
        if (cancelled) return;
        setCreative(c);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const advertiser = creative?.page?.name ?? creative?.page?.page_id;
  useEffect(() => {
    if (advertiser) document.title = `${advertiser} · Garimppu`;
  }, [advertiser]);

  if (error) return <ErrorState action="abrir o criativo" error={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!creative) return <DetailSkeleton />;

  const s = creative.score;
  const activeAds = creative.ads.filter((a) => a.is_active);

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/criativos">Voltar para criativos</BackLink>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
            <div className="aspect-square">
              <CreativeMedia creative={creative} controls fit="contain" />
            </div>
          </div>
          {(creative.video || creative.image) && (
            <DownloadMedia creativeId={creative.id} video={creative.media_type === "video" && !!creative.video && creative.video !== creative.image} />
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {creative.page?.profile_picture_url && (
                <img src={creative.page.profile_picture_url} alt="" className="size-10 rounded-full border border-line" />
              )}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {creative.page ? (
                    <Link href={`/anunciantes/${creative.page.page_id}`} className="hover:text-accent">
                      {creative.page.name ?? creative.page.page_id}
                    </Link>
                  ) : (
                    "Anunciante desconhecido"
                  )}
                </h1>
                <p className="text-sm text-muted">
                  {creative.page?.active_ads_count ?? 0} anúncios ativos coletados
                  {creative.niche && ` · ${label(creative.niche)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ScoreBadge value={s?.score ?? 0} />
              <div className="rounded-md border border-line">
                <CollectionMenu target={{ creativeId: creative.id }} selected={creative.collection_ids} collections={collections}
                  onChange={(ids) => { setCreative({ ...creative, collection_ids: ids }); reload(); }}
                  itemName={`este criativo de ${creative.page?.name ?? "anunciante desconhecido"}`} />
              </div>
            </div>
          </div>

          {(creative.offer || creative.link_url) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="label mb-0">Oferta</span>
              {creative.offer ? (
                <Link href={`/criativos?offer=${encodeURIComponent(creative.offer.key)}`}
                  className="flex min-w-0 items-center gap-2 font-medium transition-colors hover:text-accent">
                  <span className="truncate">{creative.offer.label}</span>
                  <span className="shrink-0 rounded-full border border-line px-2 text-micro font-normal text-muted">{offerTag(creative.offer)}</span>
                </Link>
              ) : (
                <span className="text-sm text-muted">não identificada</span>
              )}
              {creative.link_url && (
                <a href={creative.link_url} target="_blank" rel="noreferrer" className="btn ml-auto h-8 text-xs pointer-coarse:h-11">
                  {creative.offer ? OFFER_OPEN_LABEL[creative.offer.kind] : "Abrir página de destino"}
                  <ExternalIcon />
                </a>
              )}
            </div>
          )}

          {s && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 md:grid-cols-5 lg:max-xl:grid-cols-3">
              <Stat label="Anúncios ativos" value={s.duplicates} hint="soma das cópias deste criativo, incluindo as agrupadas pela Meta" />
              <Stat label="Dias ativo" value={s.days_active} hint={`desde ${formatDate(creative.start_date)}`} />
              {creative.has_history ? (
                <Stat label="Em 7 dias" value={formatGrowth(s.growth_7d)} hint="variação de anúncios ativos" />
              ) : (
                <Stat label="Em 7 dias" value="—" hint="aparece depois de outra coleta, em outro dia" />
              )}
              <Stat label="Plataformas" value={s.platforms_count} hint={creative.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")} />
              <Stat label="Anúncios da página" value={s.page_active_ads} hint="anúncios ativos desta página" className="col-span-2 md:col-span-1 lg:max-xl:col-span-2" />
            </dl>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label">Copy</h2>
              {creative.title && <p className="mb-2 font-medium">{creative.title}</p>}
              <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">{creative.body ?? "Sem texto"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {creative.cta_text && <span className="rounded bg-surface-2 px-2 py-1 text-xs">{creative.cta_text}</span>}
                {creative.library_url && (
                  <a href={creative.library_url} target="_blank" rel="noreferrer" className="btn h-7 text-xs pointer-coarse:h-11">Ver na Biblioteca</a>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label">Evolução de anúncios ativos</h2>
              <Sparkline points={creative.snapshots} />
              <p className="mt-3 text-xs text-muted">Visto pela 1ª vez em {formatDateTime(creative.first_seen_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Anúncios com este criativo <span className="text-sm font-normal text-muted">({activeAds.length} ativos de {creative.ads.length})</span>
        </h2>
        <div className="rounded-lg border border-line sm:overflow-x-auto">
          <table className="block w-full text-sm sm:table">
            <thead className="hidden bg-surface text-left text-xs uppercase tracking-wider text-muted sm:table-header-group">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Texto</th>
                <th className="px-3 py-2 font-medium">Início</th>
                <th className="px-3 py-2 font-medium">Cópias</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-line sm:table-row-group">
              {creative.ads.map((ad) => (
                <tr key={ad.ad_archive_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 text-xs sm:table-row sm:p-0 sm:text-sm">
                  <td className="order-first font-mono text-xs sm:px-3 sm:py-2">
                    <a href={ad.library_url} target="_blank" rel="noreferrer" className="text-accent hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{ad.ad_archive_id}</a>
                  </td>
                  <td className="order-last w-full text-sm text-muted sm:w-auto sm:max-w-xl sm:px-3 sm:py-2"><p className="line-clamp-2">{ad.body ?? ad.title ?? "-"}</p></td>
                  <td className="whitespace-nowrap sm:px-3 sm:py-2">{formatDate(ad.start_date)}</td>
                  <td className="font-mono tabular-nums sm:px-3 sm:py-2">
                    {ad.collation_count ?? 1}<span className="font-sans text-muted sm:hidden"> {(ad.collation_count ?? 1) === 1 ? "cópia" : "cópias"}</span>
                  </td>
                  <td className="sm:px-3 sm:py-2">
                    <span className={ad.is_active ? "text-ok" : "text-muted"}>{ad.is_active ? "Ativo" : "Inativo"}</span>
                  </td>                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint, className = "" }: { label: string; value: string | number; hint?: string; className?: string }) {
  return (
    <div className={`bg-surface px-4 py-3 lg:px-3 xl:px-4 ${className}`} title={hint}>
      <dt className="text-xs uppercase tracking-wider text-balance text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}
