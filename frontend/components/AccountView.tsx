"use client";

import { useState } from "react";
import { api, formatDate } from "@/lib/api";
import { useAuth } from "./AuthProvider";

export function AccountView() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ ok: false, text: "A confirmação não confere com a nova senha." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ ok: true, text: "Senha alterada." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted">E-mail</dt>
          <dd>{user.email}</dd>
          {user.name && (
            <>
              <dt className="text-muted">Nome</dt>
              <dd>{user.name}</dd>
            </>
          )}
          <dt className="text-muted">Licença</dt>
          <dd>{user.is_admin ? "Administrador" : user.expires_at ? `válida até ${formatDate(user.expires_at)}` : "ativa, sem data de vencimento"}</dd>
        </dl>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Trocar senha</h2>
        <div>
          <label className="label" htmlFor="current">Senha atual</label>
          <input id="current" type="password" autoComplete="current-password" required className="field"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="new">Nova senha</label>
            <input id="new" type="password" autoComplete="new-password" required minLength={8} className="field"
              value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="new-hint" />
            <p id="new-hint" className="mt-1 text-xs text-muted">Mínimo de 8 caracteres.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Repita a nova senha</label>
            <input id="confirm" type="password" autoComplete="new-password" required minLength={8} className="field"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {message && (
            <p role="status" className={`mr-auto text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</p>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Salvando..." : "Trocar senha"}</button>
        </div>
      </form>
    </div>
  );
}
