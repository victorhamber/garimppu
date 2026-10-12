"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, type Collection } from "@/lib/api";

type Props = {
  target: { creativeId: number } | { offerKey: string };
  selected: number[];
  collections: Collection[];
  onChange: (ids: number[]) => void;
};

function add(collectionId: number, target: Props["target"]) {
  const [path, body] = "offerKey" in target
    ? ["offers", { offer_key: target.offerKey }]
    : ["items", { creative_id: target.creativeId }];
  return api(`/api/collections/${collectionId}/${path}`, { method: "POST", body: JSON.stringify(body) });
}

function remove(collectionId: number, target: Props["target"]) {
  const path = "offerKey" in target
    ? `offers?offer_key=${encodeURIComponent(target.offerKey)}`
    : `items/${target.creativeId}`;
  return api(`/api/collections/${collectionId}/${path}`, { method: "DELETE" });
}

export function CollectionMenu({ target, selected, collections, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const favorites = collections.find((c) => c.name === "Favoritos") ?? collections[0];
  const isFavorite = favorites ? selected.includes(favorites.id) : false;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function toggle(collectionId: number) {
    setBusy(true);
    try {
      if (selected.includes(collectionId)) {
        await remove(collectionId, target);
        onChange(selected.filter((id) => id !== collectionId));
      } else {
        await add(collectionId, target);
        onChange([...selected, collectionId]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={ref}
      className="relative flex"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
      onBlur={(e) => {
        // Only a focus move to another control closes it; clicks outside are handled by the mousedown listener.
        if (open && e.relatedTarget && !ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={busy || !favorites}
        onClick={() => favorites && toggle(favorites.id)}
        aria-pressed={isFavorite}
        aria-label="Favorito"
        title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={`btn btn-ghost h-8 rounded-r-none px-2 pointer-coarse:h-11 pointer-coarse:px-3 ${isFavorite ? "text-accent" : "text-muted"}`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Salvar em coleção"
        title="Salvar em coleção"
        className="btn btn-ghost h-8 rounded-l-none px-1.5 text-muted pointer-coarse:h-11 pointer-coarse:px-3"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={panelId} role="group" aria-label="Coleções" className="absolute right-0 bottom-full z-20 mb-1 w-52 rounded-md border border-line bg-surface p-1 shadow-xl">
          {collections.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">Nenhuma coleção</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2 pointer-coarse:py-3">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={selected.includes(c.id)}
                disabled={busy}
                onChange={() => toggle(c.id)}
              />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
