import { PLATFORM_LABELS, PLATFORM_SHORT, type CreativeHeat, type Score, type ScoreHeat } from "@/lib/api";

const reached = (value: number, cutoff: number | null | undefined) => cutoff != null && value >= cutoff;

export function heatClass(score: number, heat?: ScoreHeat | null): string {
  if (reached(score, heat?.hot)) return "bg-hot text-accent-ink";
  if (reached(score, heat?.warm)) return "bg-accent text-accent-ink";
  return "bg-surface-2 text-foreground";
}

export const HEAT_HINT = "brasa = top 5% deste resultado, âmbar = top 20%";

export function ScoreBadge({ score, heat }: { score: Score | null; heat?: ScoreHeat | null }) {
  const value = score?.score ?? 0;
  return (
    <span
      title={`Score de escala (${HEAT_HINT})`}
      className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${heatClass(value, heat)}`}
    >
      {value.toFixed(2)}
    </span>
  );
}

export function formatGrowth(growth: number): string {
  if (!growth) return "0%";
  return `${growth > 0 ? "+" : ""}${Math.round(growth * 100)}%`;
}

export function MetricRow({ score, heat, hasHistory }: { score: Score | null; heat?: CreativeHeat | null; hasHistory: boolean }) {
  if (!score) return null;
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
      <Metric label="anúncios" value={score.duplicates} strong={reached(score.duplicates, heat?.duplicates)} />
      <Metric label="dias ativo" value={score.days_active} strong={reached(score.days_active, heat?.days_active)} />
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
    </dl>
  );
}

/** Always-visible reading key for the score badge; the badge itself carries no words. */
const FORMULAS = {
  creative: "Score de escala: soma anúncios ativos, dias no ar, plataformas, crescimento e tamanho do anunciante.",
  offer: "Score de oferta: soma anunciantes (peso maior), anúncios, criativos e tempo no ar.",
  video: "Score de vídeo: soma visualizações por dia, quanto superou o tamanho do canal, engajamento e aceleração.",
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

function Metric({ label, value, strong, tone }: { label: string; value: string | number; strong?: boolean; tone?: string }) {
  return (
    <div className="flex flex-col-reverse bg-surface px-1 py-1.5">
      <dt className="micro">{label}</dt>
      <dd className={`font-mono text-sm tabular-nums ${tone ?? (strong ? "text-accent" : "text-foreground")}`}>{value}</dd>
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
