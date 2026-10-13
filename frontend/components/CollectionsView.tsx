"use client";

import Link from "next/link";
import { useState } from "react";
import { api, formatDate } from "@/lib/api";
import { useCollections } from "@/lib/hooks";
import { ErrorState } from "./ErrorState";
import { UndoToast, useUndoableDelete } from "./UndoToast";

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

  function remove(id: number, collectionName: string) {
    setError(null);
    deletion.remove(id, `Coleção "${collectionName}" excluída.`, () =>
      api(`/api/collections/${id}`, { method: "DELETE" })
        .catch((err: Error) => {
          setError({ action: `excluir "${collectionName}"`, message: err.message });
          throw err;
        })
        .finally(reload));
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
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
            <Link href={`/colecoes/${c.id}`} className="min-w-0">
              <p className="truncate font-medium hover:text-accent">{c.name}</p>
              <p className="text-xs text-muted">{c.offers_count > 0 && `${c.offers_count} ${c.offers_count === 1 ? "oferta" : "ofertas"} · `}
                {c.items_count} criativos{c.refs_count > 0 && ` · ${c.refs_count} de outras fontes`} · criada em {formatDate(c.created_at)}</p>
            </Link>
            {c.name !== "Favoritos" && (
              <button type="button" onClick={() => remove(c.id, c.name)} aria-label={`Excluir a coleção ${c.name}`}
                className="btn btn-ghost h-8 text-xs text-muted hover:text-danger pointer-coarse:h-11">
                Excluir
              </button>
            )}
          </div>
        ))}
      </div>
      <UndoToast message={deletion.message} onUndo={deletion.undo} />
    </div>
  );
}
