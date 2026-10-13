"use client";

/* eslint-disable @next/next/no-img-element -- page avatars come from Meta's CDN */
import Link from "next/link";
import { BackLink } from "./BackLink";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api, formatDate, formatDateTime, PLATFORM_LABELS, type CreativeDetail, type ScoreHeat, type CreativePage,
} from "@/lib/api";
import { useCollections, useNiches } from "@/lib/hooks";
import { CollectionMenu } from "./CollectionMenu";
import { CreativeMedia } from "./CreativeMedia";
import { formatGrowth, ScoreBadge } from "./Metrics";
import { Sparkline } from "./Sparkline";

export function CreativeDetailView() {
  const { id } = useParams<{ id: string }>();
  const [creative, setCreative] = useState<CreativeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { collections, reload } = useCollections();
  const { label } = useNiches();

  const [heat, setHeat] = useState<ScoreHeat | null>(null);

  useEffect(() => {
    api<CreativeDetail>(`/api/creatives/${id}`).then(setCreative).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    api<CreativePage>("/api/creatives?limit=1").then((page) => setHeat(page.heat)).catch(() => setHeat(null));
  }, []);

  if (error) return <p className="text-danger">{error}</p>;
  if (!creative) return <p className="text-muted">Carregando...</p>;

  const s = creative.score;
  const activeAds = creative.ads.filter((a) => a.is_active);

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/criativos">Voltar para criativos</BackLink>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
          <div className="aspect-square">
            <CreativeMedia creative={creative} controls fit="contain" />
          </div>
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
              <ScoreBadge value={s?.score ?? 0} heat={heat} />
              <div className="rounded-md border border-line">
                <CollectionMenu target={{ creativeId: creative.id }} selected={creative.collection_ids} collections={collections}
                  onChange={(ids) => { setCreative({ ...creative, collection_ids: ids }); reload(); }} />
              </div>
            </div>
          </div>

          {s && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 md:grid-cols-5 lg:max-xl:grid-cols-3">
              <Stat label="Anúncios ativos" value={s.duplicates} hint="soma das cópias deste criativo, incluindo as agrupadas pela Meta" />
              <Stat label="Dias no ar" value={s.days_active} hint={`desde ${formatDate(creative.start_date)}`} />
              {creative.has_history ? (
                <Stat label="Crescimento 7d" value={formatGrowth(s.growth_7d)} hint="variação de anúncios ativos" />
              ) : (
                <Stat label="Crescimento 7d" value="—" hint="1ª coleta: aparece depois de uma coleta em outro dia" />
              )}
              <Stat label="Plataformas" value={s.platforms_count} hint={creative.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")} />
              <Stat label="Ads do anunciante" value={s.page_active_ads} hint="anúncios ativos da página" className="col-span-2 md:col-span-1 lg:max-xl:col-span-2" />
            </dl>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label">Copy</h2>
              {creative.title && <p className="mb-2 font-medium">{creative.title}</p>}
              <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">{creative.body ?? "Sem texto"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {creative.cta_text && <span className="rounded bg-surface-2 px-2 py-1 text-xs">{creative.cta_text}</span>}
                {creative.link_url && (
                  <a href={creative.link_url} target="_blank" rel="noreferrer" className="btn h-7 text-xs pointer-coarse:h-11">Abrir página de destino</a>
                )}
                {creative.library_url && (
                  <a href={creative.library_url} target="_blank" rel="noreferrer" className="btn h-7 text-xs pointer-coarse:h-11">Ver na Biblioteca</a>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label">Evolução de anúncios ativos</h2>
              <Sparkline points={creative.snapshots} />
              <p className="mt-3 text-xs text-muted">Primeira vez visto em {formatDateTime(creative.first_seen_at)}</p>
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
                <th className="px-3 py-2 font-medium">Fonte</th>
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
                  </td>
                  <td className="text-muted sm:px-3 sm:py-2">{ad.source}</td>
                </tr>
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
