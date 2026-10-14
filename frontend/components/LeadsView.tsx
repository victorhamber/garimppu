"use client";

import { useEffect, useState } from "react";
import { api, formatDateTime, type ExtensionLead } from "@/lib/api";
import { ErrorState } from "./ErrorState";

function downloadCsv(leads: ExtensionLead[]) {
  const rows = [["email", "primeiro_acesso", "ultimo_acesso", "assinante"],
    ...leads.map((l) => [l.email, l.created_at, l.last_seen_at, l.subscriber ? "sim" : "nao"])];
  const csv = rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: "leads-extensao.csv" });
  link.click();
  URL.revokeObjectURL(url);
}

export function LeadsView() {
  const [leads, setLeads] = useState<ExtensionLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ExtensionLead[]>("/api/admin/leads").then(setLeads).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorState action="carregar os leads" error={error} />;
  const subscribers = leads?.filter((l) => l.subscriber).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Leads da extensão</h1>
          <p className="mt-1 text-sm text-muted">E-mails que liberaram a extensão grátis.</p>
        </div>
        {leads && leads.length > 0 && (
          <button type="button" className="btn" onClick={() => downloadCsv(leads)}>Exportar CSV</button>
        )}
      </div>
      {leads && (
        <p className="text-sm text-muted">
          <span className="font-mono text-foreground tabular-nums">{leads.length}</span> leads ·{" "}
          <span className="font-mono text-foreground tabular-nums">{subscribers}</span> já assinam
        </p>
      )}
      <section className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Primeiro acesso</th>
              <th className="px-4 py-2.5 font-medium">Último uso</th>
              <th className="px-4 py-2.5 font-medium">Assinante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!leads && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted" role="status">Carregando...</td></tr>
            )}
            {leads?.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">Nenhum lead ainda.</td></tr>
            )}
            {leads?.map((lead) => (
              <tr key={lead.email}>
                <td className="px-4 py-2.5">{lead.email}</td>
                <td className="px-4 py-2.5 text-muted">{formatDateTime(lead.created_at)}</td>
                <td className="px-4 py-2.5 text-muted">{formatDateTime(lead.last_seen_at)}</td>
                <td className="px-4 py-2.5">{lead.subscriber ? <span className="text-ok">Sim</span> : <span className="text-muted">Não</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
