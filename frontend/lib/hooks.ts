"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Collection, type Niche } from "./api";

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
