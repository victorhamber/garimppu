"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const UNDO_MS = 8000;

type Pending<K> = {
  key: K;
  message: string;
  commit: () => Promise<unknown>;
  /** Where focus lands once the row is gone: the next row's `[data-undo-focus]` control, or the previous row's. */
  next: HTMLElement | null;
  /** Started from the keyboard: the toast takes focus so "Desfazer" is one Enter away. */
  keyboard: boolean;
};

export type RemoveOptions = { from?: HTMLElement | null; keyboard?: boolean };

/** Rows mark themselves with `data-undo-row` and their delete button with `data-undo-focus`. */
function neighbourOf(from: HTMLElement | null | undefined): HTMLElement | null {
  const row = from?.closest<HTMLElement>("[data-undo-row]");
  if (!row) return null;
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-undo-row]"));
  const i = rows.indexOf(row);
  const order = [...rows.slice(i + 1), ...rows.slice(0, i).reverse()];
  for (const r of order) {
    const control = r.querySelector<HTMLElement>("[data-undo-focus]");
    if (control) return control;
  }
  return null;
}

const afterRender = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

/**
 * Deletes after a grace period: the item hides at once, and the request only goes out if nobody clicks "Desfazer".
 * The countdown pauses while the toast is hovered or focused.
 */
export function useUndoableDelete<K extends string | number>() {
  const [hidden, setHidden] = useState<K[]>([]);
  const [pending, setPending] = useState<Pending<K> | null>(null);
  const pendingRef = useRef<Pending<K> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deadline = useRef(0);
  const remaining = useRef(UNDO_MS);

  const run = useCallback((item: Pending<K>) => {
    clearTimeout(timer.current);
    if (pendingRef.current === item) {
      pendingRef.current = null;
      setPending(null);
    }
    item.commit().catch(() => setHidden((keys) => keys.filter((k) => k !== item.key)));
  }, []);

  const start = useCallback((item: Pending<K>, ms: number) => {
    clearTimeout(timer.current);
    deadline.current = Date.now() + ms;
    timer.current = setTimeout(() => run(item), ms);
  }, [run]);

  const remove = useCallback((key: K, message: string, commit: () => Promise<unknown>, options: RemoveOptions = {}) => {
    if (pendingRef.current) run(pendingRef.current);
    const item: Pending<K> = { key, message, commit, next: neighbourOf(options.from), keyboard: !!options.keyboard };
    pendingRef.current = item;
    setPending(item);
    setHidden((keys) => [...keys, key]);
    remaining.current = UNDO_MS;
    start(item, UNDO_MS);
    if (!item.keyboard) afterRender(() => item.next?.isConnected && item.next.focus());
  }, [run, start]);

  const undo = useCallback(() => {
    const item = pendingRef.current;
    if (!item) return;
    clearTimeout(timer.current);
    pendingRef.current = null;
    setPending(null);
    setHidden((keys) => keys.filter((k) => k !== item.key));
    afterRender(() => document.querySelector<HTMLElement>(`[data-undo-row="${item.key}"] [data-undo-focus]`)?.focus());
  }, []);

  /** Escape: confirm now and move on to the next row. */
  const dismiss = useCallback(() => {
    const item = pendingRef.current;
    if (!item) return;
    run(item);
    afterRender(() => item.next?.isConnected && item.next.focus());
  }, [run]);

  const pause = useCallback(() => {
    if (!pendingRef.current) return;
    clearTimeout(timer.current);
    remaining.current = Math.max(deadline.current - Date.now(), 0);
  }, []);

  const resume = useCallback(() => {
    if (pendingRef.current) start(pendingRef.current, Math.max(remaining.current, 2000));
  }, [start]);

  useEffect(() => () => {
    if (pendingRef.current) run(pendingRef.current);
  }, [run]);

  return {
    isHidden: (key: K) => hidden.includes(key),
    remove,
    toast: { message: pending?.message ?? null, autoFocus: !!pending?.keyboard, onUndo: undo, onDismiss: dismiss, onPause: pause, onResume: resume },
  };
}

type ToastProps = {
  message: string | null;
  autoFocus: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
};

/** The confirmation that replaces the browser's confirm(): says what went and offers the way back. */
export function UndoToast({ message, autoFocus, onUndo, onDismiss, onPause, onResume }: ToastProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);

  useEffect(() => {
    if (message && autoFocus) buttonRef.current?.focus({ preventScroll: true });
  }, [message, autoFocus]);

  const settle = () => {
    const focused = !!boxRef.current?.contains(document.activeElement);
    if (hovered.current || focused) onPause();
    else onResume();
  };

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
      {message && (
        <div ref={boxRef}
          className="pointer-events-auto flex max-w-lg items-center gap-4 rounded-md border border-line bg-surface-2 py-2 pr-2 pl-4 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.4)]"
          onMouseEnter={() => { hovered.current = true; settle(); }}
          onMouseLeave={() => { hovered.current = false; settle(); }}
          onFocus={settle}
          onBlur={() => requestAnimationFrame(settle)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onDismiss();
            }
          }}>
          <span className="min-w-0 break-words">{message}</span>
          <button ref={buttonRef} type="button" className="btn h-8 shrink-0 text-xs pointer-coarse:h-11" onClick={onUndo}>
            Desfazer
          </button>
        </div>
      )}
    </div>
  );
}
