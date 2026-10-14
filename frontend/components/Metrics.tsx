import type { ReactNode } from "react";
import { PLATFORM_LABELS, PLATFORM_SHORT, type Score, type ScoreHeat } from "@/lib/api";

const reached = (value: number, cutoff: number | null | undefined) => cutoff != null && value >= cutoff;

function heatClass(score: number, heat?: ScoreHeat | null): string {
  if (reached(score, heat?.hot)) return "bg-hot text-accent-ink";
  if (reached(score, heat?.warm)) return "bg-accent text-accent-ink";
  return "bg-surface-2 text-foreground";
}

/** Same cut points as backend pipeline/nota.py and extension/filters.js. */
const TIERS = [
  { min: 65, label: "forte", className: "bg-hot text-accent-ink" },
  { min: 50, label: "boa", className: "bg-accent text-accent-ink" },
  { min: 35, label: "média", className: "bg-surface-2 text-foreground" },
  { min: 0, label: "baixa", className: "border border-line text-muted" },
] as const;

export const tierOf = (nota: number) => TIERS.find((t) => nota >= t.min) ?? TIERS[TIERS.length - 1];

/** The badge's full reading, for tooltips and accessible names: "pontuação 72 de 100, forte". */
export function scorePhrase(nota: number): string {
  return `pontuação ${Math.round(nota)} de 100, ${tierOf(nota).label}`;
}

/** Relative position as text ("top 5%"), for badges that show their own value instead of a nota (keywords). */
function rankText(value: number, heat?: ScoreHeat | null): string | null {
  const steps = heat?.ranks ?? [];
  if (steps.length === 0) return null;
  const hit = steps.find(([, cutoff]) => value >= cutoff);
  return hit ? `top ${Math.round(hit[0] * 100)}%` : `fora do top ${Math.round(steps.at(-1)![0] * 100)}%`;
}

/** Whether a metric is in the top 10% of the current result, by the server's cutoff (`ctr_rank`: lower wins). */
export function topMetric(heat: ScoreHeat | null | undefined, name: string, value: number | null | undefined): boolean {
  const cutoff = heat?.metrics?.[name];
  if (cutoff == null || value == null) return false;
  return name === "ctr_rank" ? value <= cutoff : value >= cutoff;
}

type ScoreBadgeProps = {
  /** The 0-100 nota; with `children`, any value ranked against `heat` instead. */
  value: number;
  heat?: ScoreHeat | null;
  /** What the nota adds up, for the tooltip, e.g. "Nota da oferta: ...". */
  title?: string;
  /** Shown instead of the nota (keywords show the search volume), colored by position in the result. */
  children?: ReactNode;
  className?: string;
};

const BADGE = "shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap tabular-nums";

/** The one score badge: "72 escalado". Ember from 65, amber from 50, neutral from 35, outlined below. */
export function ScoreBadge({ value, heat, title = "Pontuação", children, className = "" }: ScoreBadgeProps) {
  if (children != null) {
    const rank = rankText(value, heat) ?? "sem comparação";
    return (
      <span title={`${title} · ${rank} deste resultado`} className={`${BADGE} ${heatClass(value, heat)} ${className}`}>
        {children}<span className="sr-only"> ({rank})</span>
      </span>
    );
  }
  const tier = tierOf(value);
  const phrase = scorePhrase(value);
  return (
    <span title={`${phrase[0].toUpperCase()}${phrase.slice(1)} · ${title}`} className={`${BADGE} ${tier.className} ${className}`}>
      <span aria-hidden="true">{Math.round(value)} {tier.label}</span><span className="sr-only">{phrase}</span>
    </span>
  );
}

export function formatGrowth(growth: number): string {
  if (!growth) return "0%";
  return `${growth > 0 ? "+" : ""}${Math.round(growth * 100)}%`;
}

export function MetricRow({ score, heat, hasHistory }: { score: Score | null; heat?: ScoreHeat | null; hasHistory: boolean }) {
  if (!score) return null;
  return (
    <MetricStrip className="grid-cols-3">
      <Metric label="anúncios" value={score.duplicates} strong={topMetric(heat, "duplicates", score.duplicates)} />
      <Metric label="dias ativo" value={score.days_active} strong={topMetric(heat, "days_active", score.days_active)} />
      {hasHistory ? (
        <Metric
          label="em 7 dias"
          value={formatGrowth(score.growth_7d)}
          strong={topMetric(heat, "growth_7d", score.growth_7d)}
          tone={score.growth_7d < 0 ? "text-danger" : undefined}
        />
      ) : (
        <Metric label="primeira vez" value="—" tone="text-muted" />
      )}
    </MetricStrip>
  );
}

/** The signature strip: equal cells, 1px dividers drawn by the gap; columns come from `className`. */
export function MetricStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <dl className={`grid gap-px overflow-hidden rounded-md border border-line bg-line text-center ${className}`}>
      {children}
    </dl>
  );
}

type MetricProps = { label: string; value: ReactNode; strong?: boolean; tone?: string; title?: string };

/** Value in amber when `strong` (top 10% of the result); `tone` overrides, e.g. red for a drop. */
export function Metric({ label, value, strong, tone, title }: MetricProps) {
  return (
    <div className="flex min-w-0 flex-col-reverse bg-surface px-1 py-1.5 sm:px-2" title={title}>
      <dt className="micro truncate max-xl:tracking-normal">{label}</dt>
      <dd className={`font-mono text-sm tabular-nums ${tone ?? (strong ? "text-accent" : "text-foreground")}`}>{value}</dd>
    </div>
  );
}

export type NotaPart = { label: string; weight: number; share: number | null };

export const fill = (value: number) => Math.max(0, Math.min(value, 1));

/** Points each part adds to the nota, as backend pipeline/nota.py weighs them: unmeasured parts ("—") are left out. */
export function notaPoints(parts: NotaPart[]): { label: string; value: string }[] {
  const known = parts.reduce((sum, p) => sum + (p.share == null ? 0 : p.weight), 0) || 1;
  return parts.map((p) => ({
    label: p.label,
    value: p.share == null ? "—" : String(Math.round((100 * p.weight * p.share) / known)),
  }));
}

/** The parts that add up to a card's nota, opened on demand; the badge's tooltip carries the same sum. */
export function ScoreParts({ parts }: { parts: { label: string; value: string }[] }) {
  return (
    <details className="group text-micro text-muted">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 transition-colors hover:text-foreground pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        Pontos da nota
        <svg viewBox="0 0 24 24" className="size-3 transition-transform group-open:rotate-180" fill="none" stroke="currentColor"
          strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className="mt-1">{parts.map((p) => `${p.label} ${p.value}`).join(" · ")}</p>
    </details>
  );
}

const FORMULAS = {
  creative: "Anúncios iguais 35, dias ativo 25, anúncios desta página 15, redes 10 e crescimento em 7 dias 15.",
  offer: "Anúncios 35, anunciantes 20, versões 15, dias ativo 15, também no TikTok ou no YouTube 10 e anunciantes novos em 14 dias 5.",
  video: "Visualizações por dia 40, acima dos inscritos 25, curtidas e comentários 15 e crescimento 20.",
  tiktok: "Cliques comparados ao assunto 45, curtidas 20, comentários e compartilhamentos 20 e verba 15.",
  site: "Anúncios 35, anunciantes 20, versões 15, dias ativo 15, também no TikTok ou no YouTube 10 e anunciantes novos em 14 dias 5.",
};

const GLOSSARY: Partial<Record<keyof typeof FORMULAS, string>> = {
  video: "Acima dos inscritos: quantas vezes as visualizações passam o tamanho do canal.",
  tiktok: "Cliques no topo do assunto: este anúncio recebe mais clique que a maioria do mesmo assunto.",
};

const HEAT_KEY = (
  <>
    {TIERS.slice(0, 3).map((t) => (
      <span key={t.label} className="flex items-center gap-1.5">
        <span className={`rounded px-1 font-mono text-micro font-semibold ${t.className}`}>{t.label}</span>{t.min}+
      </span>
    ))}
  </>
);

/** Reading key for the score badge: one line on desktop, a single "Legenda" link on phones; the formula opens on demand. */
export function ScoreLegend({ kind = "creative" }: { kind?: keyof typeof FORMULAS }) {
  return (
    <details className="group text-xs text-muted">
      <summary className="flex w-fit cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 transition-colors hover:text-foreground pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className="hidden items-center gap-x-3 sm:flex">{HEAT_KEY}</span>
        <span className="underline decoration-line underline-offset-2 group-open:decoration-accent">
          <span className="sm:hidden">Legenda</span>
          <span className="hidden sm:inline">Como a pontuação é feita</span>
        </span>
      </summary>
      <div className="mt-1.5 flex max-w-prose flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-x-3 sm:hidden">{HEAT_KEY}</span>
        <p>Pontuação de 0 a 100: {FORMULAS[kind]} Abaixo de 35 é baixa.</p>
        {GLOSSARY[kind] && <p>{GLOSSARY[kind]}</p>}
      </div>
    </details>
  );
}

const PLATFORM_ORDER = ["facebook", "instagram", "whatsapp", "messenger", "threads", "audience_network"];

/** The two reach-defining placements, then a count; the full list stays in the accessible name. */
export function Platforms({ platforms, max = 2 }: { platforms: string[]; max?: number }) {
  if (platforms.length === 0) return null;
  const sorted = [...platforms].sort((a, b) => {
    const rank = (p: string) => (PLATFORM_ORDER.indexOf(p) + 1 || 99);
    return rank(a) - rank(b);
  });
  const shown = sorted.slice(0, max);
  const rest = sorted.length - shown.length;
  const all = sorted.map((p) => PLATFORM_LABELS[p] ?? p).join(", ");
  return (
    <span className="inline-flex items-center gap-1" title={all}>
      <span className="sr-only">Plataformas: {all}</span>
      {shown.map((p) => (
        <span key={p} aria-hidden="true" className="rounded border border-line px-1 font-mono text-micro text-muted">
          {PLATFORM_SHORT[p] ?? p}
        </span>
      ))}
      {rest > 0 && <span aria-hidden="true" className="font-mono text-micro text-muted">+{rest}</span>}
    </span>
  );
}
