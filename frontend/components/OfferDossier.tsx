"use client";

import Link from "next/link";
import { OFFER_KIND_LABEL, OFFER_OPEN_LABEL, offerTag, type Collection, type Offer, type OfferEntry } from "@/lib/api";
import { BackLink } from "./BackLink";
import { CollectionMenu } from "./CollectionMenu";
import { ExternalIcon } from "./ExternalIcon";
import { Metric, MetricStrip } from "./Metrics";

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;
const LISTED = 5;
const linkClass = "text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent";

/** "2026-03-12" as a local date: `new Date()` would read it as UTC midnight and show the day before in Brazil. */
function localDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const shortDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

/** Cumulative advertisers over time, one step per entrant, from the first one to today. */
function EntryChart({ entries, today }: { entries: OfferEntry[]; today: Date }) {
  const width = 600;
  const height = 96;
  const start = localDay(entries[0].since).getTime();
  const span = Math.max(today.getTime() - start, DAY_MS);
  const n = entries.length;
  const x = (t: number) => ((t - start) / span) * width;
  const y = (count: number) => height - (count / n) * (height - 6) - 1;

  let path = `M0,${y(0).toFixed(1)}`;
  entries.forEach((e, i) => {
    const px = x(localDay(e.since).getTime()).toFixed(1);
    path += ` L${px},${y(i).toFixed(1)} L${px},${y(i + 1).toFixed(1)}`;
  });
  path += ` L${width},${y(n).toFixed(1)}`;

  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-24 w-full" role="img"
        aria-label={`${n} ${n === 1 ? "anunciante" : "anunciantes"} entre ${shortDate(localDay(entries[0].since))} e hoje`}>
        <path d={`${path} L${width},${height} L0,${height} Z`} fill="var(--accent)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="flex justify-between font-mono text-micro text-muted tabular-nums">
        <span>{shortDate(localDay(entries[0].since))}</span>
        <span>hoje</span>
      </figcaption>
    </figure>
  );
}

function Entries({ entries }: { entries: OfferEntry[] }) {
  const today = startOfToday();
  const recent = entries.filter((e) => today.getTime() - localDay(e.since).getTime() <= RECENT_DAYS * DAY_MS).length;
  const latest = [...entries].reverse().slice(0, LISTED);

  return (
    <section aria-labelledby="dossie-entradas" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dossie-entradas" className="label mb-0">Anunciantes entrando</h2>
        <p className="text-xs text-muted">
          {recent > 0 ? (
            <><span className="font-mono font-semibold text-accent tabular-nums">+{recent}</span> nos últimos {RECENT_DAYS} dias</>
          ) : `Nenhum novo nos últimos ${RECENT_DAYS} dias`}
        </p>
      </div>
      {entries.length > 1 ? (
        <EntryChart entries={entries} today={today} />
      ) : (
        <p className="text-sm text-muted">Um anunciante só até agora. Quando outros entrarem, a curva aparece aqui.</p>
      )}
      <ol className="flex flex-col divide-y divide-line text-sm">
        {latest.map((e) => (
          <li key={e.page_id} className="flex min-w-0 items-baseline gap-3 py-1.5">
            <Link href={`/anunciantes/${e.page_id}`} className="min-w-0 flex-1 truncate hover:text-accent">
              {e.name ?? e.page_id}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {e.active ? `desde ${shortDate(localDay(e.since))}` : "parou"}
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
              {e.ads} {e.ads === 1 ? "anúncio" : "anúncios"}
            </span>
          </li>
        ))}
      </ol>
      {entries.length > LISTED && (
        <p className="text-xs text-muted">
          +{entries.length - LISTED} {entries.length - LISTED === 1 ? "anunciante mais antigo" : "anunciantes mais antigos"}
        </p>
      )}
    </section>
  );
}

function Presence({ offer }: { offer: Offer }) {
  const key = encodeURIComponent(offer.key);
  const rows = [
    {
      name: "Meta Ads",
      value: <>{offer.ads} {offer.ads === 1 ? "anúncio" : "anúncios"} de {offer.advertisers} {offer.advertisers === 1 ? "anunciante" : "anunciantes"}</>,
    },
    {
      name: "TikTok",
      value: offer.tiktok_ads > 0
        ? <Link href={`/tiktok?offer=${key}`} className={linkClass}>{offer.tiktok_ads} entre os top anúncios</Link>
        : <span className="text-muted">não apareceu</span>,
    },
    {
      name: "YouTube",
      value: offer.videos > 0
        ? <Link href={`/videos?offer=${key}`} className={linkClass}>{offer.videos} {offer.videos === 1 ? "vídeo" : "vídeos"} em alta</Link>
        : <span className="text-muted">não apareceu</span>,
    },
  ];
  return (
    <section aria-labelledby="dossie-presenca" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <h2 id="dossie-presenca" className="label mb-0">Presença</h2>
      <dl className="flex flex-col divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.name} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-muted">{r.name}</dt>
            <dd className="text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Props = { offer: Offer; collections: Collection[]; onCollectionsChange: (ids: number[]) => void };

/** The offer as a place: who is running it and since when, where else it shows up, and the way to its checkout. */
export function OfferDossier({ offer, collections, onCollectionsChange }: Props) {
  const entries = offer.entries ?? [];
  const domain = offer.url?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

  return (
    <header className="flex flex-col gap-4">
      <BackLink href="/">Ofertas</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{offer.label}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="rounded-full border border-line px-2 text-micro text-foreground">{offerTag(offer)}</span>
            {offer.platform && <span>{OFFER_KIND_LABEL[offer.kind]}</span>}
            {domain && <span className="break-all">{domain}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {offer.url && (
            <a href={offer.url} target="_blank" rel="noreferrer" className="btn h-9 pointer-coarse:h-11">
              {OFFER_OPEN_LABEL[offer.kind]}
              <ExternalIcon />
            </a>
          )}
          <div className="rounded-md border border-line">
            <CollectionMenu target={{ offerKey: offer.key }} selected={offer.collection_ids} collections={collections}
              onChange={onCollectionsChange} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        {entries.length > 0 && <Entries entries={entries} />}
        <div className="flex flex-col gap-4">
          <MetricStrip className="grid-cols-4 lg:grid-cols-2">
            <Metric label="anunciantes" value={offer.advertisers} />
            <Metric label="anúncios" value={offer.ads} />
            <Metric label="criativos" value={offer.creatives} />
            <Metric label="dias no ar" value={offer.days_active} />
          </MetricStrip>
          <Presence offer={offer} />
        </div>
      </div>
    </header>
  );
}
