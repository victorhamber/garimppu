"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { api, formatDate, formatDateTime, type Run, type Search, type TikTokIndustry } from "@/lib/api";
import { useNiches } from "@/lib/hooks";
import { CountrySelect } from "./CountrySelect";

const REFRESH_OPTIONS = [
  { value: "", label: "Manual" },
  { value: "24", label: "Diário" },
  { value: "72", label: "A cada 3 dias" },
  { value: "168", label: "Semanal" },
];

const STATUS: Record<Run["status"], { label: string; className: string }> = {
  queued: { label: "Na fila", className: "bg-surface-2 text-muted" },
  running: { label: "Coletando", className: "bg-accent/15 text-accent" },
  done: { label: "Concluída", className: "bg-ok/15 text-ok" },
  error: { label: "Erro", className: "bg-danger/15 text-danger" },
};

const EMPTY_FORM = {
  source: "meta" as "meta" | "youtube" | "tiktok" | "sites" | "trends",
  mode: "keyword" as "keyword" | "page",
  term: "",
  page: "",
  country: "BR",
  language: "",
  media_type: "all",
  niche: "",
  industry: "",
  max_ads: "300",
  refresh_hours: "24",
};

/** Each search page costs 100 of the 10,000 daily YouTube API units, so keep collections small. */
const YOUTUBE_MAX = 150;
const YOUTUBE_DEFAULT = "100";
/** TikTok lists top ads 20 at a page and each new ad needs one more request for its details. */
const TIKTOK_MAX = 200;
const TIKTOK_DEFAULT = "100";
/** Cloudflare Radar returns at most 100 domains per ranking. */
const SITES_MAX = 100;
/** Google Trends' feed lists ~10 terms at a time; the cap only satisfies the API. */
const TRENDS_MAX = 50;
const MAX_BY_SOURCE = { meta: 3000, youtube: YOUTUBE_MAX, tiktok: TIKTOK_MAX, sites: SITES_MAX, trends: TRENDS_MAX };
const DEFAULT_BY_SOURCE = {
  meta: EMPTY_FORM.max_ads, youtube: YOUTUBE_DEFAULT, tiktok: TIKTOK_DEFAULT, sites: String(SITES_MAX), trends: String(TRENDS_MAX),
};

const UNIT: Partial<Record<Search["source"], string>> = { youtube: "vídeos", tiktok: "anúncios", sites: "sites", trends: "palavras" };
const KIND_LABEL: Partial<Record<Search["source"], string>> = {
  youtube: "YouTube", tiktok: "TikTok Ads", sites: "Sites (Cloudflare)", trends: "Google · em alta",
};

function creativesHref(search: Search) {
  const params = new URLSearchParams({ search_id: String(search.id) });
  if (search.source === "youtube") return `/videos?${params}`;
  if (search.source === "tiktok") return `/tiktok?${params}`;
  if (search.source === "sites") return `/sites?${params}`;
  if (search.source === "trends") return `/palavras-chave?${params}`;
  if (search.niche) params.set("niche", search.niche);
  return `/?${params}`;
}

/** The source row is created a few ms before the search, so only a gap of minutes means it was already monitored. */
function joinedLater(search: Search) {
  return Date.parse(search.created_at) - Date.parse(search.monitored_since) > 5 * 60_000;
}

const MANUAL_RUN_GAP_MS = 24 * 3_600_000;
const TRENDS_RUN_GAP_MS = 3_600_000;

/** When a manual run is allowed again; the API refuses runs within 24h (1h for Google Trends) of the last one. */
function nextManualRun(search: Search, now: number): number | null {
  const run = search.latest_run;
  if (run?.status !== "done" || !run.finished_at) return null;
  const gap = search.source === "trends" ? TRENDS_RUN_GAP_MS : MANUAL_RUN_GAP_MS;
  const next = Date.parse(run.finished_at.endsWith("Z") ? run.finished_at : `${run.finished_at}Z`) + gap;
  return next > now ? next : null;
}

export function SearchManager() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [now, setNow] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Search | null>(null);
  const [openLog, setOpenLog] = useState<number | null>(null);
  const { niches, label } = useNiches();
  const [industries, setIndustries] = useState<TikTokIndustry[]>([]);

  useEffect(() => {
    api<TikTokIndustry[]>("/api/tiktok/industries").then(setIndustries).catch(() => setIndustries([]));
  }, []);

  const load = useCallback(() => {
    api<Search[]>("/api/searches")
      .then((data) => {
        setSearches(data);
        setNow(Date.now());
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const busy = searches.some((s) => s.latest_run && ["queued", "running"].includes(s.latest_run.status));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [busy, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const youtube = form.source === "youtube";
    const tiktok = form.source === "tiktok";
    const sites = form.source === "sites";
    const trends = form.source === "trends";
    const byPage = form.source === "meta" && form.mode === "page";
    if (!tiktok && !sites && !trends && !(byPage ? form.page : form.term).trim() && !(youtube && form.niche)) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api<Search>("/api/searches", {
        method: "POST",
        body: JSON.stringify({
          term: byPage || tiktok || sites || trends ? "" : form.term,
          page: byPage ? form.page : null,
          country: form.country,
          language: sites || trends ? null : form.language || null,
          media_type: form.source === "meta" ? form.media_type : sites || trends ? "all" : "video",
          niche: tiktok || sites ? null : form.niche || null,
          tiktok_industry: tiktok && form.industry ? Number(form.industry) : null,
          site_category: null,
          site_ranking: "POPULAR",
          source: form.source === "meta" ? "hybrid" : form.source,
          max_ads: Math.min(Number(form.max_ads), MAX_BY_SOURCE[form.source]),
          refresh_hours: trends ? null : form.refresh_hours ? Number(form.refresh_hours) : null,
        }),
      });
      if (created.reused) setNotice(created);
      setForm({ ...EMPTY_FORM, source: form.source, mode: form.mode, country: form.country, refresh_hours: form.refresh_hours,
        max_ads: DEFAULT_BY_SOURCE[form.source] });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function runNow(id: number) {
    try {
      await api(`/api/searches/${id}/run`, { method: "POST" });
    } catch (err) {
      setError((err as Error).message);
    }
    load();
  }

  async function setRefresh(id: number, value: string) {
    await api(`/api/searches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ refresh_hours: value ? Number(value) : null }),
    });
    load();
  }

  async function remove(search: Search) {
    const kept = `Os ${UNIT[search.source] ?? "criativos"} coletados`;
    if (!confirm(`Excluir a busca "${search.term}"? ${kept} continuam salvos.`)) return;
    await api(`/api/searches/${search.id}`, { method: "DELETE" });
    load();
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const youtube = form.source === "youtube";
  const tiktok = form.source === "tiktok";
  const sites = form.source === "sites";
  const trends = form.source === "trends";
  const setKind = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const source = value === "youtube" || value === "tiktok" || value === "sites" || value === "trends" ? value : "meta";
      const max_ads = source === f.source ? f.max_ads : DEFAULT_BY_SOURCE[source];
      return { ...f, source, mode: value === "page" ? "page" : "keyword", max_ads };
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Minerar</h1>

      <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-4 xl:grid-cols-10">
        <div className="col-span-2">
          <label className="label" htmlFor="mode">Buscar por</label>
          <select id="mode" className="field" value={form.source === "meta" ? form.mode : form.source} onChange={setKind}>
            <option value="keyword">Meta Ads · palavra-chave</option>
            <option value="page">Meta Ads · página do anunciante</option>
            <option value="tiktok">TikTok Ads · top anúncios</option>
            <option value="youtube">YouTube · vídeos em alta</option>
            <option value="trends">Google · palavras-chave em alta</option>
          </select>
        </div>
        {trends ? (
          <div className="col-span-2 xl:col-span-2">
            <label className="label" htmlFor="niche">Nicho</label>
            <select id="niche" className="field" value={form.niche} onChange={set("niche")}
              title="O Google Trends lista o que o país inteiro está pesquisando; o nicho de cada termo é detectado pelo termo e pelas notícias ligadas a ele">
              <option value="">Todos os nichos</option>
              {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
        ) : sites ? null : tiktok ? (
          <div className="col-span-2 xl:col-span-2">
            <label className="label" htmlFor="industry">Nicho do TikTok</label>
            <select id="industry" className="field" value={form.industry} onChange={set("industry")}
              title="O TikTok não permite busca por palavra-chave nos top anúncios; o filtro é pelo nicho (setor) do anunciante">
              <option value="">Todos os nichos</option>
              {industries.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
        ) : youtube || form.mode === "keyword" ? (
          <div className="col-span-2 xl:col-span-2">
            <label className="label" htmlFor="term">Tema ou palavra-chave</label>
            <input id="term" className="field" value={form.term} onChange={set("term")} required={!youtube || !form.niche}
              placeholder={youtube ? "opcional se escolher um nicho" : "ex.: renda extra, skincare"} />
          </div>
        ) : (
          <div className="col-span-2 xl:col-span-2">
            <label className="label" htmlFor="page">Link ou ID da página</label>
            <input id="page" className="field" value={form.page} onChange={set("page")} required
              placeholder="Link da Biblioteca ou ID" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="country">País</label>
          <CountrySelect id="country" value={form.country} onChange={(country) => setForm((f) => ({ ...f, country }))} />
        </div>
        <div hidden={sites || trends}>
          <label className="label" htmlFor="language">Idioma</label>
          <select id="language" className="field" value={form.language} onChange={set("language")}>
            <option value="">{form.source === "meta" ? "Todos" : "Do país"}</option>
            <option value="pt">Português</option>
            <option value="es">Espanhol</option>
            <option value="en">Inglês</option>
          </select>
        </div>
        {youtube && (
          <div>
            <label className="label" htmlFor="niche">Nicho</label>
            <select id="niche" className="field" value={form.niche} onChange={set("niche")}
              title="Sem tema: busca os vídeos em alta do nicho inteiro. Com tema: mostra só os vídeos desse nicho ao abrir a busca">
              <option value="">Todos</option>
              {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
        )}
        {form.source === "meta" && (
          <>
            <div>
              <label className="label" htmlFor="media">Mídia</label>
              <select id="media" className="field" value={form.media_type} onChange={set("media_type")}>
                <option value="all">Todas</option>
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="niche">Filtrar nicho</label>
              <select id="niche" className="field" value={form.niche} onChange={set("niche")}
                title="Mostra só criativos deste nicho ao abrir a busca; o nicho de cada criativo é detectado automaticamente">
                <option value="">Todos</option>
                {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
          </>
        )}
        <div hidden={trends}>
          <label className="label" htmlFor="max">{youtube ? "Máx. vídeos" : sites ? "Máx. sites" : "Máx. anúncios"}</label>
          <input id="max" type="number" min={10} max={MAX_BY_SOURCE[form.source]} step={10} className="field" value={form.max_ads}
            onChange={set("max_ads")} title={youtube ? "Os mais vistos dos últimos 30 dias. Cada 50 vídeos gastam 100 da cota diária de 10 mil da API do YouTube."
              : tiktok ? "Metade pelos melhores CTRs do nicho, metade pelos mais curtidos, nos últimos 180 dias."
              : sites ? "O Cloudflare Radar entrega no máximo os 100 primeiros de cada ranking." : undefined} />
        </div>
        {trends ? (
          <div>
            <span className="label">Recoleta</span>
            <p className="field flex items-center text-muted"
              title="O Google Trends mostra só as últimas horas; a coleta roda sozinha a cada hora para não perder termos">
              A cada hora
            </p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="refresh">Recoleta</label>
            <select id="refresh" className="field" value={form.refresh_hours} onChange={set("refresh_hours")}>
              {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2 flex items-center justify-end gap-3 md:col-span-3 xl:col-span-10">
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          {notice && !error && (
            <p role="status" className="mr-auto text-sm text-muted">
              <span className="text-foreground">{notice.term}</span> já era monitorada desde{" "}
              {formatDate(notice.monitored_since)}:{" "}
              <Link href={creativesHref(notice)} className="text-foreground underline underline-offset-2 hover:text-accent">
                <span className="font-mono tabular-nums">{notice.creatives_count}</span>{" "}
                {UNIT[notice.source] ?? "criativos"} já {notice.source === "trends" ? "coletadas" : "coletados"}
              </Link>
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Criando..." : "Minerar agora"}
          </button>
        </div>
      </form>

      {/* Below 1024px each search is a two-column card; the same markup becomes the table from lg up. */}
      <section className="rounded-lg border border-line">
        <table className="block w-full text-sm lg:table">
          <thead className="hidden bg-surface text-left text-xs uppercase tracking-wider text-muted lg:table-header-group">
            <tr>
              <th className="px-4 py-2.5 font-medium">Busca</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Resultados</th>
              <th className="px-4 py-2.5 font-medium">Última coleta</th>
              <th className="px-4 py-2.5 font-medium">Recoleta</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="block divide-y divide-line lg:table-row-group">
            {searches.length === 0 && (
              <tr className="block lg:table-row">
                <td colSpan={6} className="block px-4 py-10 text-center text-muted lg:table-cell">Nenhuma busca criada ainda.</td>
              </tr>
            )}
            {searches.map((s) => {
              const run = s.latest_run;
              const nextRun = nextManualRun(s, now);
              const status = run ? STATUS[run.status] : null;
              const yt = s.source === "youtube";
              const tt = s.source === "tiktok";
              const st = s.source === "sites";
              const unit = UNIT[s.source] ?? "anúncios";
              return (
                <Fragment key={s.id}>
                  <tr className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 align-top sm:grid-cols-4 lg:table-row lg:p-0">
                    <td className="col-span-2 sm:col-span-4 lg:px-4 lg:py-3">
                      <div className="font-medium">
                        {s.page_id ? (
                          <Link href={`/anunciantes/${s.page_id}`} className="hover:underline">{s.term}</Link>
                        ) : s.term}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {KIND_LABEL[s.source] ?? (s.page_id ? "Meta Ads · página" : "Meta Ads · palavra-chave")} · {s.country}
                        {s.source !== "trends" && ` · até ${s.max_ads} ${unit}`}
                        {!yt && !tt && !st && s.media_type !== "all" && ` · ${s.media_type === "image" ? "imagens" : "vídeos"}`}
                        {s.niche && ` · só ${label(s.niche)}`}
                        {joinedLater(s) && ` · base desde ${formatDate(s.monitored_since)}`}
                      </div>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Status</span>
                      {status ? (
                        <button type="button" onClick={() => setOpenLog(openLog === s.id ? null : s.id)}
                          aria-expanded={openLog === s.id}
                          className={`inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs font-medium pointer-coarse:min-h-11 ${status.className}`} title="Ver log">
                          {status.label}
                          {run?.status === "running" && <span aria-hidden="true" className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">Nunca executada</span>
                      )}
                      {run?.status === "done" && (
                        <div className="mt-1 text-xs text-muted">{run.ads_found} {unit} na última coleta</div>
                      )}
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Resultados</span>
                      <span className="font-mono tabular-nums">{s.creatives_count}</span>{" "}
                      <span className="text-xs text-muted">{UNIT[s.source] ?? "criativos"}</span>
                    </td>
                    <td className="text-muted lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Última coleta</span>
                      {formatDateTime(s.last_run_at)}
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      {s.source === "trends" ? (
                        <>
                          <span className="label lg:hidden">Recoleta</span>
                          <span className="text-xs text-muted" title="Automática enquanto a busca estiver ativa">A cada hora</span>
                        </>
                      ) : (
                        <>
                          <label className="label lg:hidden" htmlFor={`refresh-${s.id}`}>Recoleta</label>
                          <select id={`refresh-${s.id}`} aria-label={`Recoleta de ${s.term}`}
                            className="field h-8 w-full pointer-coarse:h-11 lg:w-36" value={s.refresh_hours ? String(s.refresh_hours) : ""}
                            onChange={(e) => setRefresh(s.id, e.target.value)}>
                            {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            {s.refresh_hours && !REFRESH_OPTIONS.some((o) => o.value === String(s.refresh_hours)) && (
                              <option value={String(s.refresh_hours)}>A cada {s.refresh_hours}h</option>
                            )}
                          </select>
                        </>
                      )}
                    </td>
                    <td className="col-span-2 sm:col-span-4 lg:px-4 lg:py-3">
                      <div className="flex flex-wrap gap-1 lg:flex-nowrap lg:justify-end">
                        <Link href={creativesHref(s)} className="btn h-8 text-xs pointer-coarse:h-11">{`Ver ${UNIT[s.source] ?? "criativos"}`}</Link>
                        {nextRun ? (
                          <span title={`Coletada ${s.source === "trends" ? "na última hora" : "nas últimas 24h"}. Nova coleta liberada em ${formatDateTime(new Date(nextRun).toISOString())}`}>
                            <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" disabled>Coletada</button>
                          </span>
                        ) : (
                          <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={() => runNow(s.id)}
                            disabled={!!run && ["queued", "running"].includes(run.status)}>
                            Coletar
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost ml-auto h-8 text-xs text-muted hover:text-danger pointer-coarse:h-11 lg:ml-0" onClick={() => remove(s)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openLog === s.id && run && (
                    <tr className="block lg:table-row">
                      <td colSpan={6} className="block bg-surface px-4 py-3 lg:table-cell">
                        {run.error && <p className="mb-2 text-sm text-danger">{run.error}</p>}
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">
                          {run.log || "Sem log ainda."}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}