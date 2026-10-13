import type { ReactNode } from "react";
import { PLATFORM_LABELS, PLATFORM_SHORT, type Score, type ScoreHeat } from "@/lib/api";

const reached = (value: number, cutoff: number | null | undefined) => cutoff != null && value >= cutoff;

function heatClass(score: number, heat?: ScoreHeat | null): string {
  if (reached(score, heat?.hot)) return "bg-hot text-accent-ink";
  if (reached(score, heat?.warm)) return "bg-accent text-accent-ink";
  return "bg-surface-2 text-foreground";
}

export const HEAT_HINT = "brasa = top 5% deste resultado, âmbar = top 20%";

/** What a badge's position is measured against: the list on screen, or every active item in the base. */
export type RankReference = "result" | "base";
const REFERENCE_TEXT: Record<RankReference, string> = { result: "deste resultado", base: "da base" };

/**
 * Relative position as text: "top 5%" for the tightest step the value reaches, "fora do top 50%" below them all,
 * null when the set is too small to rank (the server sends no steps).
 */
export function rankText(value: number, heat?: ScoreHeat | null): string | null {
  const steps = heat?.ranks ?? [];
  if (steps.length === 0) return null;
  const hit = steps.find(([, cutoff]) => value >= cutoff);
  return hit ? `top ${Math.round(hit[0] * 100)}%` : `fora do top ${Math.round(steps.at(-1)![0] * 100)}%`;
}

/** The badge's full reading, for tooltips and accessible names: "top 5% deste resultado". */
export function rankPhrase(value: number, heat?: ScoreHeat | null, reference: RankReference = "result"): string {
  const text = rankText(value, heat);
  return text ? `${text} ${REFERENCE_TEXT[reference]}` : "sem comparação: poucos itens";
}

/** Whether a metric is in the top 10% of the current result, by the server's cutoff (`ctr_rank`: lower wins). */
export function topMetric(heat: ScoreHeat | null | undefined, name: string, value: number | null | undefined): boolean {
  const cutoff = heat?.metrics?.[name];
  if (cutoff == null || value == null) return false;
  return name === "ctr_rank" ? value <= cutoff : value >= cutoff;
}

type ScoreBadgeProps = {
  value: number;
  heat?: ScoreHeat | null;
  /** What is being ranked, for the tooltip, e.g. "Score de oferta". */
  title?: string;
  /** "result" in lists (the legend says so on screen), "base" on a detail page, where the badge spells it out. */
  reference?: RankReference;
  /** Shown instead of the position (keywords show the search volume); the position still reaches screen readers. */
  children?: ReactNode;
  className?: string;
};

/**
 * The one score badge: the item's relative position ("top 5%"), never the raw score.
 * Neutral, amber in the top 20% of the reference, ember in the top 5%.
 */
export function ScoreBadge({ value, heat, title = "Score de escala", reference = "result", children, className = "" }: ScoreBadgeProps) {
  const phrase = rankPhrase(value, heat, reference);
  const text = rankText(value, heat);
  const ranked = text != null && !text.startsWith("fora");
  const shown = !ranked ? "—" : reference === "base" ? phrase : text;
  return (
    <span
      title={`${phrase[0].toUpperCase()}${phrase.slice(1)} · ${title}`}
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap tabular-nums ${heatClass(value, heat)} ${className}`}
    >
      {children != null ? (
        <>{children}<span className="sr-only"> ({phrase})</span></>
      ) : (
        <><span aria-hidden="true">{shown}</span><span className="sr-only">{phrase}</span></>
      )}
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
      <Metric label="dias no ar" value={score.days_active} strong={topMetric(heat, "days_active", score.days_active)} />
      {hasHistory ? (
        <Metric
          label="cresc. 7d"
          value={formatGrowth(score.growth_7d)}
          strong={topMetric(heat, "growth_7d", score.growth_7d)}
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

/** The parts that add up to a card's score, opened on demand; the badge's tooltip carries the same sum. */
export function ScoreParts({ parts }: { parts: { label: string; value: string }[] }) {
  return (
    <details className="group text-micro text-muted">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 transition-colors hover:text-foreground pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        Pontos do score
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
  creative: "Soma anúncios ativos, dias no ar, plataformas, crescimento e tamanho do anunciante.",
  offer: "Soma anunciantes (peso maior), anúncios, criativos e dias no ar, com bônus se a oferta também está no TikTok ou no YouTube.",
  video: "Soma views por dia, quanto o vídeo superou o canal, engajamento e aceleração.",
  tiktok: "Soma a taxa de cliques (CTR) comparada ao nicho (peso maior), curtidas, comentários, compartilhamentos e verba.",
  site: "Soma anunciantes (peso maior), anúncios, criativos e dias no ar de todos os produtos do site.",
};

const GLOSSARY: Partial<Record<keyof typeof FORMULAS, string>> = {
  video: "Vs. inscritos: quantas vezes as views passam o número de inscritos do canal. Engaj.: curtidas e comentários por view (comentário vale o dobro). Acelerando ou desacelerando: views por dia desde a última coleta contra a média desde a publicação; aparece a partir da 2ª coleta.",
  tiktok: "CTR no top 3% do nicho: a taxa de cliques do anúncio é melhor que a de 97% dos anúncios do mesmo nicho.",
};

const HEAT_KEY = (
  <>
    <span className="flex items-center gap-1.5">
      <span className="rounded bg-hot px-1 font-mono text-micro font-semibold text-accent-ink">brasa</span>top 5%
    </span>
    <span className="flex items-center gap-1.5">
      <span className="rounded bg-accent px-1 font-mono text-micro font-semibold text-accent-ink">âmbar</span>top 20% deste resultado
    </span>
  </>
);

/** Reading key for the score badge: one line on desktop, a single "Legenda" link on phones; the formula opens on demand. */
export function ScoreLegend({ kind = "creative" }: { kind?: keyof typeof FORMULAS }) {
  return (
    <details className="group text-xs text-muted">
      <summary className="flex w-fit cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 transition-colors hover:text-foreground pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className="hidden items-center gap-x-3 sm:flex">{HEAT_KEY}</span>
        <span className="underline decoration-line underline-offset-2 group-open:decoration-accent">
          <span className="sm:hidden">Legenda do score</span>
          <span className="hidden sm:inline">Como o score é calculado</span>
        </span>
      </summary>
      <div className="mt-1.5 flex max-w-prose flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-x-3 sm:hidden">{HEAT_KEY}</span>
        <p>{FORMULAS[kind]} O selo mostra a posição do item neste resultado, do top 1% ao top 50%; &quot;—&quot; fica na metade de baixo.</p>
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
