"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TYPING_DELAY_MS = 400;

type Draft<K extends string> = Partial<Record<K, string>>;

function cleanValue(value: string | undefined): string {
  return value && value.trim() ? value : "";
}

/**
 * One filter model for every panel: filters live in the URL, selects/checkboxes apply at once,
 * typed fields (`typedKeys`) apply after a short pause, and `flush` (Enter) applies everything now.
 */
export function useUrlFilters<K extends string>(keys: readonly K[], typedKeys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paramsKey = params.toString();

  const filters: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }

  const fromUrl = useCallback(() => {
    const values: Draft<K> = {};
    for (const key of typedKeys) values[key] = params.get(key) ?? "";
    return values;
  }, [params, typedKeys]);

  // `seen` is the last URL rendered, `key` the URL we expect after our own commit.
  // A URL change we did not cause (back button, "Limpar filtros", a link) resets the draft.
  const [draft, setDraftState] = useState<{ seen: string; key: string; values: Draft<K> }>(() => ({
    seen: paramsKey,
    key: paramsKey,
    values: fromUrl(),
  }));
  if (draft.seen !== paramsKey) {
    setDraftState(
      paramsKey === draft.key
        ? { ...draft, seen: paramsKey }
        : { seen: paramsKey, key: paramsKey, values: fromUrl() },
    );
  }

  const commit = useCallback(
    (overrides: Draft<K> = {}) => {
      const next = new URLSearchParams(draft.key);
      const values = { ...draft.values, ...overrides };
      for (const [key, value] of Object.entries(values) as [K, string | undefined][]) {
        const clean = cleanValue(value);
        if (clean) next.set(key, clean);
        else next.delete(key);
      }
      const nextKey = next.toString();
      const typedOverrides: Draft<K> = {};
      for (const key of typedKeys) if (key in overrides) typedOverrides[key] = overrides[key];
      setDraftState((prev) => ({ ...prev, key: nextKey, values: { ...prev.values, ...typedOverrides } }));
      if (nextKey !== paramsKey) router.replace(`${pathname}${nextKey ? `?${nextKey}` : ""}`, { scroll: false });
    },
    [draft.key, draft.values, paramsKey, pathname, router, typedKeys],
  );

  const committed = new URLSearchParams(draft.key);
  const pending = typedKeys.some((key) => cleanValue(draft.values[key]) !== (committed.get(key) ?? ""));

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => commit(), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, commit]);

  return {
    filters,
    draft: draft.values,
    hasFilters: keys.some((key) => params.get(key)),
    /** Typed fields: keep the keystroke locally, apply after the pause. */
    type: (key: K, value: string) => setDraftState((prev) => ({ ...prev, values: { ...prev.values, [key]: value } })),
    /** Selects, checkboxes, chips: apply now, together with anything still being typed. */
    set: (key: K, value: string) => commit({ [key]: value } as Draft<K>),
    /** Enter: apply everything typed so far without waiting. */
    flush: () => commit(),
    clear: () => {
      const empty: Draft<K> = {};
      for (const key of typedKeys) empty[key] = "";
      setDraftState((prev) => ({ ...prev, key: "", values: empty }));
      router.replace(pathname, { scroll: false });
    },
  };
}

export const digitsOnly = (value: string) => value.replace(/\D/g, "");
