"use client";

import Link from "next/link";
import { useState } from "react";
import { api, formatDate, type Collection } from "@/lib/api";
import { useCollections } from "@/lib/hooks";
import { ErrorState } from "./ErrorState";
import { UndoToast, useUndoableDelete } from "./UndoToast";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Only what the collection holds: "2 ofertas", never "2 ofertas · 0 criativos". */
function summary(c: Collection): string {
  const parts = [
    c.offers_count > 0 && plural(c.offers_count, "oferta", "ofertas"),
    c.items_count > 0 && plural(c.items_count, "criativo", "criativos"),
    c.refs_count > 0 && plural(c.refs_count, "item de outras fontes", "itens de outras fontes"),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Vazia";
}

export function CollectionsView() {
  const { collections, reload } = useCollections();
  const [name, setName] = useState("");
  const [error, setError] = useState<{ action: string; message: string } | null>(null);
  const deletion = useUndoableDelete<number>();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api("/api/collections", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      setError(null);
      reload();
    } catch (err) {
      setError({ action: "criar a coleção", message: (err as Error).message });
    }
  }

  function remove(id: number, collectionName: string, e: React.MouseEvent<HTMLButtonElement>) {
    const origin = { from: e.currentTarget, keyboard: e.detail === 0 };
    setError(null);
    deletion.remove(id, `Coleção "${collectionName}" excluída.`, () =>
      api(`/api/collections/${id}`, { method: "DELETE" })
        .catch((err: Error) => {
          setError({ action: `excluir "${collectionName}"`, message: err.message });
          throw err;
        })
        .finally(reload), origin);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coleções</h1>
        <p className="mt-1 text-sm text-muted">Tudo o que você salvou, de qualquer fonte.</p>
      </div>

      <form onSubmit={create} className="max-w-md">
        <label className="label" htmlFor="new-collection">Nova coleção</label>
        <div className="flex gap-2">
          <input id="new-collection" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Emagrecimento" />
          <button type="submit" className="btn btn-primary shrink-0">Criar</button>
        </div>
      </form>
      {error && <ErrorState action={error.action} error={error.message} compact />}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {collections.filter((c) => !deletion.isHidden(c.id)).map((c) => (
          <div key={c.id} data-undo-row={c.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
            <Link href={`/colecoes/${c.id}`} className="min-w-0">
              <p className="truncate font-medium hover:text-accent">{c.name}</p>
              <p className="text-xs text-muted">{summary(c)} · criada em {formatDate(c.created_at)}</p>
            </Link>
            {c.name !== "Favoritos" && (
              <button type="button" onClick={(e) => remove(c.id, c.name, e)} aria-label={`Excluir a coleção ${c.name}`} data-undo-focus
                className="btn btn-ghost h-8 text-xs text-muted hover:text-danger pointer-coarse:h-11">
                Excluir
              </button>
            )}
          </div>
        ))}
      </div>
      <UndoToast {...deletion.toast} />
    </div>
  );
}
