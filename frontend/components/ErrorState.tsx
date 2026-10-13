"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  /** What failed, as the end of "Não foi possível …", e.g. "carregar as ofertas". */
  action: string;
  /** The real reason, as `api()` worded it. */
  error: string;
  onRetry?: () => void;
  /** Where "Voltar" goes; without it, the previous page (or Ofertas when there is none). */
  backHref?: string;
  /** Inline variant for menus and sections: no "Voltar". */
  compact?: boolean;
};

/** The one error surface: what failed, why, and the way out. */
export function ErrorState({ action, error, onRetry, backHref, compact = false }: Props) {
  const router = useRouter();
  const btn = "btn h-8 text-xs pointer-coarse:h-11";

  function back() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div role="alert"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-danger/40 bg-danger/10 text-sm ${compact ? "px-2 py-1.5" : "px-3 py-2.5"}`}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium text-danger">Não foi possível {action}.</p>
        <p className="break-words text-foreground/80">{error}</p>
      </div>
      {(onRetry || !compact) && (
        <div className="flex shrink-0 gap-2">
          {onRetry && <button type="button" className={btn} onClick={onRetry}>Tentar de novo</button>}
          {!compact && (backHref
            ? <Link href={backHref} className={`${btn} btn-ghost`}>Voltar</Link>
            : <button type="button" className={`${btn} btn-ghost`} onClick={back}>Voltar</button>)}
        </div>
      )}
    </div>
  );
}
