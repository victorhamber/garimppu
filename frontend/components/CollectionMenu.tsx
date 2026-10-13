"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api, toQuery, type Collection, type CollectionRefKind } from "@/lib/api";
import { ErrorState } from "./ErrorState";

export type CollectionTarget = { creativeId: number } | { offerKey: string } | { kind: CollectionRefKind; ref: string };

type Props = {
  target: CollectionTarget;
  selected: number[];
  collections: Collection[];
  onChange: (ids: number[]) => void;
};

function add(collectionId: number, target: CollectionTarget) {
  const [path, body] = "offerKey" in target
    ? ["offers", { offer_key: target.offerKey }]
    : "kind" in target
      ? ["refs", { kind: target.kind, ref: target.ref }]
      : ["items", { creative_id: target.creativeId }];
  return api(`/api/collections/${collectionId}/${path}`, { method: "POST", body: JSON.stringify(body) });
}

function remove(collectionId: number, target: CollectionTarget) {
  const path = "offerKey" in target
    ? `offers${toQuery({ offer_key: target.offerKey })}`
    : "kind" in target
      ? `refs${toQuery({ kind: target.kind, ref: target.ref })}`
      : `items/${target.creativeId}`;
  return api(`/api/collections/${collectionId}/${path}`, { method: "DELETE" });
}

/**
 * Opens upward by default (save sits at the bottom of cards); flips down when the sticky header or the screen top
 * leaves less room above than the panel needs and there is more room below, above the phone's bottom bar.
 */
function opensBelow(anchor: HTMLElement, rows: number): boolean {
  const rowHeight = window.matchMedia("(pointer: coarse)").matches ? 48 : 34;
  const needed = Math.max(rows, 1) * rowHeight + 16;
  const box = anchor.getBoundingClientRect();
  const top = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const bar = document.querySelector<HTMLElement>("nav.fixed")?.getBoundingClientRect();
  const bottom = bar && bar.height > 0 ? bar.top : window.innerHeight;
  const above = box.top - Math.max(top, 0);
  const below = bottom - box.bottom;
  return above < needed && below > above;
}

export function CollectionMenu({ target, selected, collections, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ action: string; message: string } | null>(null);
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
    const removing = selected.includes(collectionId);
    setBusy(true);
    setError(null);
    try {
      if (removing) {
        await remove(collectionId, target);
        onChange(selected.filter((id) => id !== collectionId));
      } else {
        await add(collectionId, target);
        onChange([...selected, collectionId]);
      }
    } catch (e) {
      const name = collections.find((c) => c.id === collectionId)?.name ?? "coleção";
      setError({ action: removing ? `tirar de "${name}"` : `salvar em "${name}"`, message: (e as Error).message });
      setOpen(true);
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
        title={!favorites ? "Crie uma coleção para salvar" : isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={`btn btn-ghost h-8 rounded-r-none px-2 pointer-coarse:h-11 pointer-coarse:px-3 ${isFavorite ? "text-accent" : "text-muted"}`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => {
          if (!open && ref.current) setBelow(opensBelow(ref.current, collections.length));
          setOpen((v) => !v);
          setError(null);
        }}
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
        <div id={panelId} role="group" aria-label="Coleções" className={`absolute right-0 z-20 w-64 ${below ? "top-full mt-1" : "bottom-full mb-1"} rounded-md border border-line bg-surface p-1 shadow-xl`}>
          {error && (
            <div className="mb-1">
              <ErrorState action={error.action} error={error.message} compact />
            </div>
          )}
          {collections.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted">
              Nenhuma coleção. <Link href="/colecoes" className="text-foreground underline decoration-line underline-offset-2 hover:decoration-accent">Criar</Link>
            </p>
          )}
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
