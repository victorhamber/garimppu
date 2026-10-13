"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { api, formatDate, formatDateTime, type Run, type Search } from "@/lib/api";
import { useNiches } from "@/lib/hooks";

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
  source: "meta" as "meta" | "youtube",
  mode: "keyword" as "keyword" | "page",
  term: "",
  page: "",
  country: "BR",
  language: "",
  media_type: "all",
  niche: "",
  max_ads: "300",
  refresh_hours: "24",
};

/** Each search page costs 100 of the 10,000 daily YouTube API units, so keep collections small. */
const YOUTUBE_MAX = 150;
const YOUTUBE_DEFAULT = "100";

function creativesHref(search: Search) {
  const params = new URLSearchParams({ search_id: String(search.id) });
  if (search.source === "youtube") return `/videos?${params}`;
  if (search.niche) params.set("niche", search.niche);
  return `/?${params}`;
}

/** The source row is created a few ms before the search, so only a gap of minutes means it was already monitored. */
function joinedLater(search: Search) {
  return Date.parse(search.created_at) - Date.parse(search.monitored_since) > 5 * 60_000;
}

const MANUAL_RUN_GAP_MS = 24 * 3_600_000;

/** When a manual run is allowed again; the API refuses runs within 24h of the last finished one. */
function nextManualRun(search: Search, now: number): number | null {
  const run = search.latest_run;
  if (run?.status !== "done" || !run.finished_at) return null;
  const next = Date.parse(run.finished_at.endsWith("Z") ? run.finished_at : `${run.finished_at}Z`) + MANUAL_RUN_GAP_MS;
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
    const byPage = !youtube && form.mode === "page";
    if (!(byPage ? form.page : form.term).trim() && !(youtube && form.niche)) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api<Search>("/api/searches", {
        method: "POST",
        body: JSON.stringify({
          term: byPage ? "" : form.term,
          page: byPage ? form.page : null,
          country: form.country,
          language: form.language || null,
          media_type: youtube ? "video" : form.media_type,
          niche: form.niche || null,
          source: youtube ? "youtube" : "hybrid",
          max_ads: youtube ? Math.min(Number(form.max_ads), YOUTUBE_MAX) : Number(form.max_ads),
          refresh_hours: form.refresh_hours ? Number(form.refresh_hours) : null,
        }),
      });
      if (created.reused) setNotice(created);
      setForm({ ...EMPTY_FORM, source: form.source, mode: form.mode, country: form.country, refresh_hours: form.refresh_hours,
        max_ads: youtube ? YOUTUBE_DEFAULT : EMPTY_FORM.max_ads });
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
    const kept = search.source === "youtube" ? "Os vídeos coletados" : "Os criativos coletados";
    if (!confirm(`Excluir a busca "${search.term}"? ${kept} continuam salvos.`)) return;
    await api(`/api/searches/${search.id}`, { method: "DELETE" });
    load();
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const youtube = form.source === "youtube";
  const setKind = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const source = value === "youtube" ? "youtube" : "meta";
      const max_ads = source === f.source ? f.max_ads : source === "youtube" ? YOUTUBE_DEFAULT : EMPTY_FORM.max_ads;
      return { ...f, source, mode: value === "page" ? "page" : "keyword", max_ads };
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minerar anúncios</h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
          Cada busca coleta anúncios ativos da Biblioteca de Anúncios, agrupa criativos repetidos e calcula o score de
          escala. Use aspas para frase exata (ex.: <span className="font-mono text-foreground">&quot;secar barriga&quot;</span>).
          Buscas com recoleta automática medem o crescimento dos criativos ao longo do tempo. Para acompanhar um
          concorrente, busque por <span className="text-foreground">Página</span>: abra a página dele na Biblioteca de
          Anúncios e cole o link (contém <span className="font-mono text-foreground">view_all_page_id</span>).
          Buscas iguais compartilham a mesma coleta: se o termo já é monitorado, os criativos aparecem na hora.
          Buscando por <span className="text-foreground">YouTube</span>, a coleta traz os vídeos orgânicos mais vistos dos
          últimos 30 dias e mede quais pegaram tração rápido; sem tema, escolha um nicho para ver o que está em alta nele
          (resultado em{" "}
          <Link href="/videos" className="text-foreground underline underline-offset-2 hover:text-accent">Vídeos</Link>).
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-4 xl:grid-cols-9">
        <div>
          <label className="label" htmlFor="mode">Buscar por</label>
          <select id="mode" className="field" value={youtube ? "youtube" : form.mode} onChange={setKind}>
            <option value="keyword">Palavra-chave</option>
            <option value="page">Página</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        {youtube || form.mode === "keyword" ? (
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
          <input id="country" className="field uppercase" value={form.country} onChange={set("country")} maxLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="language">Idioma</label>
          <select id="language" className="field" value={form.language} onChange={set("language")}>
            <option value="">{youtube ? "Do país" : "Todos"}</option>
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
        {!youtube && (
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
        <div>
          <label className="label" htmlFor="max">{youtube ? "Máx. vídeos" : "Máx. anúncios"}</label>
          <input id="max" type="number" min={10} max={youtube ? YOUTUBE_MAX : 3000} step={10} className="field" value={form.max_ads}
            onChange={set("max_ads")} title={youtube ? "Os mais vistos dos últimos 30 dias. Cada 50 vídeos gastam 100 da cota diária de 10 mil da API do YouTube." : undefined} />
        </div>
        <div>
          <label className="label" htmlFor="refresh">Recoleta</label>
          <select id="refresh" className="field" value={form.refresh_hours} onChange={set("refresh_hours")}>
            {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-3 md:col-span-3 xl:col-span-9">
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          {notice && !error && (
            <p role="status" className="mr-auto text-sm text-muted">
              <span className="text-foreground">{notice.term}</span> já era monitorada desde{" "}
              {formatDate(notice.monitored_since)}:{" "}
              <Link href={creativesHref(notice)} className="text-foreground underline underline-offset-2 hover:text-accent">
                <span className="font-mono tabular-nums">{notice.creatives_count}</span>{" "}
                {notice.source === "youtube" ? "vídeos" : "criativos"} já coletados
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
              const unit = yt ? "vídeos" : "anúncios";
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
                        {yt ? "YouTube" : s.page_id ? "Página" : "Palavra-chave"} · {s.country} · até {s.max_ads} {unit}
                        {!yt && s.media_type !== "all" && ` · ${s.media_type === "image" ? "imagens" : "vídeos"}`}
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
                      <span className="text-xs text-muted">{yt ? "vídeos" : "criativos"}</span>
                    </td>
                    <td className="text-muted lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Última coleta</span>
                      {formatDateTime(s.last_run_at)}
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <label className="label lg:hidden" htmlFor={`refresh-${s.id}`}>Recoleta</label>
                      <select id={`refresh-${s.id}`} aria-label={`Recoleta de ${s.term}`}
                        className="field h-8 w-full pointer-coarse:h-11 lg:w-36" value={s.refresh_hours ? String(s.refresh_hours) : ""}
                        onChange={(e) => setRefresh(s.id, e.target.value)}>
                        {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        {s.refresh_hours && !REFRESH_OPTIONS.some((o) => o.value === String(s.refresh_hours)) && (
                          <option value={String(s.refresh_hours)}>A cada {s.refresh_hours}h</option>
                        )}
                      </select>
                    </td>
                    <td className="col-span-2 sm:col-span-4 lg:px-4 lg:py-3">
                      <div className="flex flex-wrap gap-1 lg:flex-nowrap lg:justify-end">
                        <Link href={creativesHref(s)} className="btn h-8 text-xs pointer-coarse:h-11">{yt ? "Ver vídeos" : "Ver criativos"}</Link>
                        {nextRun ? (
                          <span title={`Coletada nas últimas 24h. Nova coleta liberada em ${formatDateTime(new Date(nextRun).toISOString())}`}>
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