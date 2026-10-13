import type { ReactNode } from "react";
import { PLATFORM_LABELS, PLATFORM_SHORT, type Score, type ScoreHeat } from "@/lib/api";

const reached = (value: number, cutoff: number | null | undefined) => cutoff != null && value >= cutoff;

function heatClass(score: number, heat?: ScoreHeat | null): string {
  if (reached(score, heat?.hot)) return "bg-hot text-accent-ink";
  if (reached(score, heat?.warm)) return "bg-accent text-accent-ink";
  return "bg-surface-2 text-foreground";
}

export const HEAT_HINT = "brasa = top 5% deste resultado, âmbar = top 20%";

/** Whether a metric is in the top 10% of the current result, by the server's cutoff (`ctr_rank`: lower wins). */
export function topMetric(heat: ScoreHeat | null | undefined, name: string, value: number | null | undefined): boolean {
  const cutoff = heat?.metrics?.[name];
  if (cutoff == null || value == null) return false;
  return name === "ctr_rank" ? value <= cutoff : value >= cutoff;
}

type ScoreBadgeProps = {
  value: number;
  heat?: ScoreHeat | null;
  /** What the number is, for the tooltip, e.g. "Score de oferta". */
  title?: string;
  /** Shown instead of the number (keywords show the search volume). */
  children?: ReactNode;
  className?: string;
};

/** The one score badge: neutral, amber in the top 20% of the result, ember in the top 5%. */
export function ScoreBadge({ value, heat, title = "Score de escala", children, className = "" }: ScoreBadgeProps) {
  return (
    <span
      title={`${title} (${HEAT_HINT})`}
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap tabular-nums ${heatClass(value, heat)} ${className}`}
    >
      {children ?? value.toFixed(2)}
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
          label="cresc. 7d"
          value={formatGrowth(score.growth_7d)}
          strong={score.growth_7d > 0}
          tone={score.growth_7d < 0 ? "text-danger" : undefined}
        />
      ) : (
        <Metric label="1ª coleta" value="—" tone="text-muted" />
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

/** Always-visible reading key for the score badge; the badge itself carries no words. */
const FORMULAS = {
  creative: "Score de escala: soma anúncios ativos, dias no ar, plataformas, crescimento e tamanho do anunciante.",
  offer: "Score de oferta: soma anunciantes (peso maior), anúncios, criativos, tempo no ar e um bônus quando a oferta também aparece no TikTok, no YouTube ou no ranking de sites mais acessados.",
  video: "Score de vídeo: soma visualizações por dia, quanto superou o tamanho do canal, engajamento e aceleração.",
  tiktok: "Score TikTok: soma o CTR comparado ao nicho (peso maior), curtidas, comentários e compartilhamentos, e a faixa de verba.",
  site: "Score do site: soma anunciantes (peso maior), anúncios, criativos e tempo no ar de todos os produtos do site.",
};

export function ScoreLegend({ kind = "creative" }: { kind?: keyof typeof FORMULAS }) {
  const formula = FORMULAS[kind];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>{formula}</span>
      <span className="flex items-center gap-1.5">
        <span className="rounded bg-hot px-1 font-mono text-micro font-semibold text-accent-ink">brasa</span>
        top 5%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded bg-accent px-1 font-mono text-micro font-semibold text-accent-ink">âmbar</span>
        top 20% deste resultado
      </span>
    </div>
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
