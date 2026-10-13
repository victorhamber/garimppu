"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const UNDO_MS = 8000;

type Pending<K> = { key: K; message: string; commit: () => Promise<unknown> };

/** Deletes after a grace period: the item hides at once, and the request only goes out if nobody clicks "Desfazer". */
export function useUndoableDelete<K>() {
  const [hidden, setHidden] = useState<K[]>([]);
  const [pending, setPending] = useState<Pending<K> | null>(null);
  const pendingRef = useRef<Pending<K> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback((item: Pending<K>) => {
    clearTimeout(timer.current);
    if (pendingRef.current === item) {
      pendingRef.current = null;
      setPending(null);
    }
    item.commit().catch(() => setHidden((keys) => keys.filter((k) => k !== item.key)));
  }, []);

  const remove = useCallback((key: K, message: string, commit: () => Promise<unknown>) => {
    if (pendingRef.current) run(pendingRef.current);
    const item = { key, message, commit };
    pendingRef.current = item;
    setPending(item);
    setHidden((keys) => [...keys, key]);
    timer.current = setTimeout(() => run(item), UNDO_MS);
  }, [run]);

  const undo = useCallback(() => {
    const item = pendingRef.current;
    if (!item) return;
    clearTimeout(timer.current);
    pendingRef.current = null;
    setPending(null);
    setHidden((keys) => keys.filter((k) => k !== item.key));
  }, []);

  useEffect(() => () => {
    if (pendingRef.current) run(pendingRef.current);
  }, [run]);

  return { isHidden: (key: K) => hidden.includes(key), remove, undo, message: pending?.message ?? null };
}

/** The confirmation that replaces the browser's confirm(): says what went and offers the way back. */
export function UndoToast({ message, onUndo }: { message: string | null; onUndo: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (message) buttonRef.current?.focus({ preventScroll: true });
  }, [message]);

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
      {message && (
        <div className="pointer-events-auto flex max-w-lg items-center gap-4 rounded-md border border-line bg-surface-2 py-2 pr-2 pl-4 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.4)]">
          <span className="min-w-0 break-words">{message}</span>
          <button ref={buttonRef} type="button" className="btn h-8 shrink-0 text-xs pointer-coarse:h-11" onClick={onUndo}>
            Desfazer
          </button>
        </div>
      )}
    </div>
  );
}
