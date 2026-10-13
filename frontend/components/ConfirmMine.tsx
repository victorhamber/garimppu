"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ErrorState } from "./ErrorState";

type Props = {
  /** Label of the button that opens the confirmation, e.g. `Minerar "forex" na Biblioteca`. */
  label: string;
  /** What will happen, in one or two sentences: scope, cost in time, where to follow it. */
  consequence: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  className?: string;
  /** Replaces the primary-button look of the opener, for rows where a full button is too loud. */
  openerClassName?: string;
};

/** Mining scrapes Meta's Ad Library for minutes and counts against rate limits, so it is never one click. */
export function ConfirmMine({ label, consequence, confirmLabel = "Minerar agora", onConfirm, className = "", openerClassName }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    setError(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button ref={openerRef} type="button" className={openerClassName ?? `btn btn-primary ${className}`} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-describedby={descriptionId}
      className="flex max-w-md flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-left"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) cancel();
      }}
    >
      <p id={descriptionId} className="text-sm text-foreground">{consequence}</p>
      <div className="flex flex-wrap gap-2">
        <button ref={confirmRef} type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
          {busy ? "Criando busca..." : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost text-muted" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
      </div>
      {error && <ErrorState action="iniciar a coleta" error={error} compact />}
    </div>
  );
}
