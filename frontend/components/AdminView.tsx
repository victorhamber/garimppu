"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  formatDate,
  formatDateTime,
  type AccessIssued,
  type AdminSettings,
  type AdminUser,
  type LicenseEvent,
  type LicenseStatus,
} from "@/lib/api";
import { useAuth } from "./AuthProvider";

const STATUS: Record<LicenseStatus, { label: string; className: string }> = {
  ativa: { label: "Ativa", className: "bg-ok/15 text-ok" },
  bloqueada: { label: "Bloqueada", className: "bg-danger/15 text-danger" },
  expirada: { label: "Expirada", className: "border border-line text-muted" },
  admin: { label: "Admin", className: "bg-surface-2 text-foreground" },
};

export const ORIGIN: Record<string, string> = {
  admin: "Admin", hotmart: "Hotmart", kiwify: "Kiwify", cakto: "Cakto", webhook: "Webhook", cliente: "Cliente",
};

const ACTION: Record<string, string> = {
  created: "criada", granted: "liberada", revoked: "bloqueada", ignored: "ignorada",
  expiry: "validade alterada", password: "nova senha", deleted: "excluída",
};

export function eventText(e: LicenseEvent) {
  return `${ORIGIN[e.origin] ?? e.origin}: ${ACTION[e.action] ?? e.action}`;
}

/** yyyy-mm-dd in local time, for <input type="date">. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A license is valid through the whole chosen day. */
function endOfDay(date: string): string | null {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

export function AdminView() {
  const { user } = useAuth();
  return user ? <Licenses selfId={user.id} /> : null;
}

function Licenses({ selfId }: { selfId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | LicenseStatus>("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<AccessIssued | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    api<AdminUser[]>(`/api/admin/users?${params}`)
      .then((data) => {
        setUsers(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    api<LicenseEvent[]>("/api/admin/events?limit=20").then(setEvents).catch(() => setEvents([]));
  }, [q, status]);

  useEffect(load, [load]);
  useEffect(() => {
    api<AdminSettings>("/api/admin/settings").then(setSettings).catch(() => setSettings(null));
  }, []);

  async function act(id: number, request: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await request();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const patch = (u: AdminUser, body: Record<string, unknown>) =>
    act(u.id, () => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) }));

  function toggle(u: AdminUser) {
    const blocking = u.is_active;
    if (blocking && !confirm(`Bloquear o acesso de ${u.email}? A sessão dele é encerrada na hora.`)) return;
    patch(u, { is_active: !blocking });
  }

  function resetPassword(u: AdminUser) {
    if (!confirm(`Gerar uma nova senha para ${u.email}? A senha atual deixa de funcionar.`)) return;
    act(u.id, async () => {
      setIssued(await api<AccessIssued>(`/api/admin/users/${u.id}/reset-password`, { method: "POST" }));
    });
  }

  function remove(u: AdminUser) {
    if (!confirm(`Excluir a licença de ${u.email}? As buscas e coleções dele são apagadas; os anúncios coletados continuam na base.`)) return;
    act(u.id, () => api(`/api/admin/users/${u.id}`, { method: "DELETE" }));
  }

  const counts = users.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.status]: (acc[u.status] ?? 0) + 1 }), {});

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Licenças</h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
          Quem tem licença ativa entra no Garimppu. Compras aprovadas pelo webhook liberam o acesso sozinhas;
          reembolso, chargeback e cancelamento bloqueiam. Aqui você libera, bloqueia e define validade manualmente.
        </p>
      </div>

      {settings && (!settings.webhook_configured || !settings.email_configured) && (
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">
          {!settings.webhook_configured && (
            <>Compras ainda não liberam acesso sozinhas: gere a URL em{" "}
              <Link href="/admin/webhook" className="text-foreground underline decoration-line underline-offset-2 hover:decoration-accent">Webhook de compra</Link>.{" "}
            </>
          )}
          {!settings.email_configured && (
            <>Os clientes ainda não recebem a senha por e-mail: configure em{" "}
              <Link href="/admin/email" className="text-foreground underline decoration-line underline-offset-2 hover:decoration-accent">E-mail</Link>.
            </>
          )}
        </p>
      )}

      <NewLicense smtp={settings?.email_configured ?? false} onIssued={(r) => { setIssued(r); load(); }} />

      {issued && <IssuedNotice issued={issued} onClose={() => setIssued(null)} />}

      <section aria-labelledby="lic-list" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="lic-list" className="mr-auto text-lg font-semibold">
            Clientes{" "}
            <span className="font-mono text-sm font-normal text-muted tabular-nums">
              {counts.ativa ?? 0} ativas · {counts.bloqueada ?? 0} bloqueadas · {counts.expirada ?? 0} expiradas
            </span>
          </h2>
          <div className="w-full sm:w-64">
            <label className="sr-only" htmlFor="lic-q">Buscar licença</label>
            <input id="lic-q" type="search" className="field" placeholder="Buscar: e-mail ou nome" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-full sm:w-40">
            <label className="sr-only" htmlFor="lic-status">Status</label>
            <select id="lic-status" className="field" value={status} onChange={(e) => setStatus(e.target.value as "" | LicenseStatus)}>
              <option value="">Todos os status</option>
              <option value="ativa">Ativas</option>
              <option value="bloqueada">Bloqueadas</option>
              <option value="expirada">Expiradas</option>
              <option value="admin">Admins</option>
            </select>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        {/* Below 1024px each license is a card; the same markup becomes the table from lg up. */}
        <div className="rounded-lg border border-line">
          <table className="block w-full text-sm lg:table">
            <thead className="hidden bg-surface text-left text-xs uppercase tracking-wider text-muted lg:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Validade</th>
                <th className="px-4 py-2.5 font-medium">Último acesso</th>
                <th className="px-4 py-2.5 font-medium">Última ação</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="block divide-y divide-line lg:table-row-group">
              {users.length === 0 && (
                <tr className="block lg:table-row">
                  <td colSpan={6} className="block px-4 py-10 text-center text-muted lg:table-cell">Nenhuma licença encontrada.</td>
                </tr>
              )}
              {users.map((u) => {
                const st = STATUS[u.status];
                const self = u.id === selfId;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 align-top sm:grid-cols-4 lg:table-row lg:p-0">
                    <td className="col-span-2 sm:col-span-4 lg:px-4 lg:py-3">
                      <div className="font-medium break-all">{u.email}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {u.name ? `${u.name} · ` : ""}desde {formatDate(u.created_at)} · {u.searches_count} {u.searches_count === 1 ? "busca" : "buscas"}
                      </div>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Status</span>
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <label className="label lg:hidden" htmlFor={`exp-${u.id}`}>Validade</label>
                      {u.is_admin ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input id={`exp-${u.id}`} type="date" aria-label={`Validade de ${u.email}`} disabled={busy}
                            className="field h-8 w-full pointer-coarse:h-11 lg:w-40" value={toDateInput(u.expires_at)}
                            onChange={(e) => patch(u, { expires_at: endOfDay(e.target.value) })} />
                          {u.expires_at && (
                            <button type="button" className="btn btn-ghost h-8 px-2 text-xs text-muted pointer-coarse:h-11" disabled={busy}
                              onClick={() => patch(u, { expires_at: null })} title="Remover data de vencimento">
                              Sem prazo
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-muted lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Último acesso</span>
                      {u.last_login_at ? formatDateTime(u.last_login_at) : "Nunca entrou"}
                    </td>
                    <td className="text-muted lg:px-4 lg:py-3">
                      <span className="label lg:hidden">Última ação</span>
                      {u.last_event ? (
                        <span title={u.last_event.detail ?? undefined}>
                          {eventText(u.last_event)}
                          <span className="block text-xs">{formatDateTime(u.last_event.created_at)}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="col-span-2 sm:col-span-4 lg:px-4 lg:py-3">
                      {!self && (
                        <div className="flex flex-wrap gap-1 lg:flex-nowrap lg:justify-end">
                          {!u.is_admin && (
                            <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" disabled={busy} onClick={() => toggle(u)}>
                              {u.is_active ? "Bloquear" : "Liberar"}
                            </button>
                          )}
                          <button type="button" className="btn h-8 text-xs whitespace-nowrap pointer-coarse:h-11" disabled={busy} onClick={() => resetPassword(u)}>
                            Nova senha
                          </button>
                          <button type="button" className="btn btn-ghost ml-auto h-8 text-xs text-muted hover:text-danger pointer-coarse:h-11 lg:ml-0"
                            disabled={busy} onClick={() => remove(u)}>
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {events.length > 0 && (
        <section aria-labelledby="lic-events" className="flex flex-col gap-3">
          <h2 id="lic-events" className="text-lg font-semibold">Eventos recentes</h2>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                <span className="font-mono text-xs text-muted tabular-nums">{formatDateTime(e.created_at)}</span>
                <span className="break-all">{e.email}</span>
                <span className="text-muted">{eventText(e)}</span>
                {e.detail && <span className="w-full truncate text-xs text-muted sm:ml-auto sm:w-auto sm:max-w-md" title={e.detail}>{e.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NewLicense({ smtp, onIssued }: { smtp: boolean; onIssued: (r: AccessIssued) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const issued = await api<AccessIssued>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, name: name || null, expires_at: endOfDay(expires), send_email: smtp && sendEmail }),
      });
      setEmail("");
      setName("");
      setExpires("");
      onIssued(issued);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-4">
      <h2 className="col-span-2 text-lg font-semibold md:col-span-4">Liberar acesso</h2>
      <div className="col-span-2">
        <label className="label" htmlFor="nl-email">E-mail do cliente</label>
        <input id="nl-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@exemplo.com" />
      </div>
      <div>
        <label className="label" htmlFor="nl-name">Nome</label>
        <input id="nl-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" />
      </div>
      <div>
        <label className="label" htmlFor="nl-exp">Válida até</label>
        <input id="nl-exp" type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)}
          aria-describedby="nl-exp-hint" />
        <p id="nl-exp-hint" className="mt-1 text-xs text-muted">Vazio = sem vencimento</p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-3 md:col-span-4">
        <label className={`mr-auto flex min-h-6 items-center gap-2 text-sm ${smtp ? "cursor-pointer" : "text-muted"}`}>
          <input type="checkbox" className="accent-[var(--accent)]" checked={smtp && sendEmail} disabled={!smtp}
            onChange={(e) => setSendEmail(e.target.checked)} />
          {smtp ? "Enviar acesso por e-mail" : "Sem e-mail configurado: a senha aparece aqui para você repassar"}
        </label>
        {error && <span className="text-sm text-danger">{error}</span>}
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Liberando..." : "Liberar acesso"}</button>
      </div>
    </form>
  );
}

function IssuedNotice({ issued, onClose }: { issued: AccessIssued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const password = issued.temporary_password;

  async function copy() {
    if (!password) return;
    await navigator.clipboard.writeText(`E-mail: ${issued.user.email}\nSenha provisória: ${password}`);
    setCopied(true);
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
      {password ? (
        <p className="mr-auto">
          Senha provisória de <span className="font-medium">{issued.user.email}</span>:{" "}
          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground select-all">{password}</span>
          <span className="block text-xs text-muted">Copie agora: ela não aparece de novo. O cliente pode trocá-la em Minha conta.</span>
        </p>
      ) : (
        <p className="mr-auto">Acesso enviado por e-mail para <span className="font-medium">{issued.user.email}</span>.</p>
      )}
      {password && (
        <button type="button" className="btn h-8 text-xs pointer-coarse:h-11" onClick={copy}>{copied ? "Copiado" : "Copiar acesso"}</button>
      )}
      <button type="button" className="btn btn-ghost h-8 text-xs text-muted pointer-coarse:h-11" onClick={onClose}>Fechar</button>
    </div>
  );
}
