"use client";

import { useCallback, useEffect, useState } from "react";
import { api, MINING_EVENT, type Collection, type Niche, type Search } from "./api";

const MINING_POLL_BUSY_MS = 5_000;
const MINING_POLL_IDLE_MS = 60_000;

/**
 * How many of the user's searches are queued or collecting. Polls fast while any is, slowly otherwise,
 * skips hidden tabs, and rechecks at once when a search is created or run. A failed check keeps the last count.
 */
export function useMining(enabled: boolean) {
  const [running, setRunning] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let busy = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      clearTimeout(timer);
      if (!document.hidden) {
        try {
          const all = await api<Search[]>("/api/searches");
          busy = all.filter((s) => s.latest_run && ["queued", "running"].includes(s.latest_run.status)).length;
          if (!cancelled) setRunning(busy);
        } catch {}
      }
      if (!cancelled) timer = setTimeout(check, busy > 0 ? MINING_POLL_BUSY_MS : MINING_POLL_IDLE_MS);
    }
    const onVisible = () => !document.hidden && check();
    check();
    window.addEventListener(MINING_EVENT, check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(MINING_EVENT, check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return enabled ? running : 0;
}

export function useNiches() {
  const [niches, setNiches] = useState<Niche[]>([]);
  useEffect(() => {
    api<Niche[]>("/api/niches").then(setNiches).catch(() => setNiches([]));
  }, []);
  const label = useCallback(
    (id: string | null) => (id ? niches.find((n) => n.id === id)?.label ?? id : null),
    [niches],
  );
  return { niches, label };
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const reload = useCallback(() => {
    api<Collection[]>("/api/collections").then(setCollections).catch(() => setCollections([]));
  }, []);
  useEffect(reload, [reload]);
  return { collections, reload };
}
