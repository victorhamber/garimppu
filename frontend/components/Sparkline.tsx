import { formatDate } from "@/lib/api";

type Point = { taken_on: string; active_ads: number };

export function Sparkline({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">O histórico aparece a partir da segunda coleta (ative a recoleta automática na busca).</p>;
  }
  const width = 320;
  const height = 72;
  const max = Math.max(...points.map((p) => p.active_ads), 1);
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - (p.active_ads / max) * (height - 8) - 4] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" preserveAspectRatio="none" role="img"
        aria-label={`Anúncios ativos de ${first.active_ads} para ${last.active_ads}`}>
        <path d={`${line} L${width},${height} L0,${height} Z`} fill="var(--accent)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatDate(first.taken_on)}: {first.active_ads}</span>
        <span>{formatDate(last.taken_on)}: {last.active_ads}</span>
      </div>
    </div>
  );
}
