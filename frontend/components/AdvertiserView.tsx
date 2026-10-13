"use client";

/* eslint-disable @next/next/no-img-element -- page avatars come from Meta's CDN */
import { BackLink } from "./BackLink";
import { CheckToggle } from "./FilterBar";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type PageInfo, type Search } from "@/lib/api";
import { ConfirmMine } from "./ConfirmMine";
import { CreativeGrid } from "./CreativeGrid";

export function AdvertiserView() {
  const { pageId } = useParams<{ pageId: string }>();
  const [page, setPage] = useState<PageInfo | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [existing, setExisting] = useState<Search | null>(null);
  const router = useRouter();

  useEffect(() => {
    api<PageInfo>(`/api/pages/${pageId}`).then(setPage).catch(() => setPage(null));
    api<Search[]>("/api/searches")
      .then((all) => setExisting(all.find((s) => s.page_id === pageId) ?? null))
      .catch(() => setExisting(null));
  }, [pageId]);

  async function minePage() {
    if (existing) {
      await api(`/api/searches/${existing.id}/run`, { method: "POST" });
    } else {
      await api("/api/searches", {
        method: "POST",
        body: JSON.stringify({ page: pageId, term: page?.name ?? "", refresh_hours: 24 }),
      });
    }
    router.push("/buscas");
  }

  const pageName = page?.name ?? "esta página";
  const mineConsequence = existing
    ? `Coleta de novo os anúncios ativos de ${pageName} na Biblioteca de Anúncios da Meta, agora. Roda em segundo plano e leva alguns minutos; você acompanha em Minerar.`
    : `Cria uma busca para ${pageName}, coleta até 300 anúncios ativos na Biblioteca de Anúncios da Meta e recoleta uma vez por dia. Roda em segundo plano e leva alguns minutos; você acompanha em Minerar.`;

  const libraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${pageId}`;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/criativos">Voltar para criativos</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {page?.profile_picture_url && (
            <img src={page.profile_picture_url} alt="" className="size-14 rounded-full border border-line" />
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{page?.name ?? pageId}</h1>
            <p className="text-sm text-muted">
              {page ? `${page.active_ads_count} anúncios ativos coletados` : "Anunciante"}
              {page?.page_like_count ? ` · ${page.page_like_count.toLocaleString("pt-BR")} curtidas` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CheckToggle label="Somente ativos" checked={activeOnly} onChange={setActiveOnly} />
          <a href={libraryUrl} target="_blank" rel="noreferrer" className="btn">Ver todos na Biblioteca</a>
          <ConfirmMine
            key={existing ? "rerun" : "new"}
            label={existing ? "Recoletar página" : "Minerar esta página"}
            confirmLabel={existing ? "Recoletar agora" : "Minerar agora"}
            consequence={mineConsequence}
            onConfirm={minePage}
          />
        </div>
      </div>
      <CreativeGrid filters={{ page_id: pageId, active_only: activeOnly ? undefined : "false" }} />
    </div>
  );
}
