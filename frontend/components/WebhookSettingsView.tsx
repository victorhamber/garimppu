"use client";

import { useEffect, useState } from "react";
import { api, formatDateTime, type LicenseEvent, type WebhookSettings } from "@/lib/api";
import { digitsOnly } from "@/lib/useUrlFilters";
import { eventText } from "./AdminView";

const PLATFORMS = [
  {
    name: "Hotmart",
    where: "Ferramentas > Webhook (API e notificações) > Cadastrar webhook",
    steps: "Escolha o produto do Garimppu, cole a URL, use a versão 2.0.0 e marque: Compra aprovada, Compra completa, Compra reembolsada, Chargeback, Compra cancelada e Cancelamento de assinatura.",
  },
  {
    name: "Kiwify",
    where: "Apps > Webhooks > Criar webhook",
    steps: "Escolha o produto, cole a URL e marque: Compra aprovada, Reembolso, Chargeback, Assinatura cancelada e Assinatura renovada.",
  },
  {
    name: "Cakto",
    where: "Integrações > Webhooks > Adicionar",
    steps: "Escolha o produto, cole a URL e marque: Compra aprovada, Reembolso, Chargeback e Assinatura cancelada.",
  },
];

export function WebhookSettingsView() {
  const [settings, setSettings] = useState<WebhookSettings | null>(null);
  const [codes, setCodes] = useState("");
  const [days, setDays] = useState("");
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  function apply(s: WebhookSettings) {
    setSettings(s);
    setCodes(s.product_ids.join(", "));
    setDays(s.access_days ? String(s.access_days) : "");
  }

  useEffect(() => {
    api<WebhookSettings>("/api/admin/webhook").then(apply).catch((e: Error) => setMessage({ ok: false, text: e.message }));
    api<LicenseEvent[]>("/api/admin/events?limit=100")
      .then((list) => setEvents(list.filter((e) => e.origin !== "admin" && e.origin !== "cliente").slice(0, 15)))
      .catch(() => setEvents([]));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      apply(await api<WebhookSettings>("/api/admin/webhook", {
        method: "PUT",
        body: JSON.stringify({ product_ids: codes.split(","), access_days: days ? Number(days) : null }),
      }));
      setMessage({ ok: true, text: "Configuração salva." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (settings?.url && !confirm("Gerar uma nova URL? A atual para de funcionar na hora: você vai precisar trocar a URL em todas as plataformas.")) return;
    try {
      apply(await api<WebhookSettings>("/api/admin/webhook/secret", { method: "POST" }));
      setCopied(false);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Webhook de compra</h1>

      <section aria-labelledby="wh-url" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 id="wh-url" className="text-lg font-semibold">URL do webhook</h2>
        {settings?.url ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1.5 font-mono text-xs" title={settings.url}>
                {settings.url}
              </code>
              <button type="button" className="btn h-8 text-xs pointer-coarse:h-11"
                onClick={async () => { await navigator.clipboard.writeText(settings.url!); setCopied(true); }}>
                {copied ? "Copiada" : "Copiar URL"}
              </button>
              <button type="button" className="btn btn-ghost h-8 text-xs text-muted pointer-coarse:h-11" onClick={regenerate}>
                Gerar nova URL
              </button>
            </div>
            <p className="text-xs text-muted">A URL contém a chave secreta: não compartilhe. Se ela vazar, gere uma nova.</p>
          </>
        ) : settings ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-muted">Nenhuma URL gerada: compras ainda não liberam acesso sozinhas.</p>
            <button type="button" className="btn btn-primary" onClick={regenerate}>Gerar URL do webhook</button>
          </div>
        ) : (
          <p className="text-sm text-muted">Carregando...</p>
        )}
      </section>

      <form onSubmit={save} className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-3">
        <h2 className="text-lg font-semibold md:col-span-3">Regras da licença</h2>
        <div className="md:col-span-2">
          <label className="label" htmlFor="wh-codes">Códigos de produto ou oferta</label>
          <input id="wh-codes" className="field font-mono" value={codes} onChange={(e) => setCodes(e.target.value)}
            placeholder="ex.: 4839201, kq8x2lp" aria-describedby="wh-codes-hint" />
          <p id="wh-codes-hint" className="mt-1 text-xs leading-relaxed text-muted">
            Separe por vírgulas. Só compras desses produtos liberam acesso. Vazio = qualquer produto que a plataforma notificar
            (use vazio só se a URL estiver cadastrada apenas no produto do Garimppu).
          </p>
        </div>
        <div>
          <label className="label" htmlFor="wh-days">Dias de acesso por compra</label>
          <input id="wh-days" inputMode="numeric" pattern="[0-9]*" className="field" value={days}
            onChange={(e) => setDays(digitsOnly(e.target.value))} placeholder="Até cancelar" aria-describedby="wh-days-hint" />
          <p id="wh-days-hint" className="mt-1 text-xs leading-relaxed text-muted">
            Ex.: 30 no mensal, 365 no anual. Cada renovação conta a partir da cobrança. Vazio = acesso até reembolso,
            chargeback ou cancelamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-3">
          {message && <p role="status" className={`mr-auto text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving || !settings}>{saving ? "Salvando..." : "Salvar regras"}</button>
        </div>
      </form>

      <section aria-labelledby="wh-how" className="flex flex-col gap-3">
        <h2 id="wh-how" className="text-lg font-semibold">Como cadastrar na plataforma</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {PLATFORMS.map((p) => (
            <li key={p.name} className="flex flex-col gap-1.5 rounded-lg border border-line p-4 text-sm">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="font-mono text-xs text-muted">{p.where}</p>
              <p className="leading-relaxed text-muted">{p.steps}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          Os nomes dos menus mudam de vez em quando nas plataformas. Depois de cadastrar, use o botão de teste da própria
          plataforma: o evento aparece logo abaixo.
        </p>
      </section>

      <section aria-labelledby="wh-events" className="flex flex-col gap-3">
        <h2 id="wh-events" className="text-lg font-semibold">Últimas notificações recebidas</h2>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Nenhuma notificação recebida ainda.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                <span className="font-mono text-xs text-muted tabular-nums">{formatDateTime(e.created_at)}</span>
                <span className="break-all">{e.email}</span>
                <span className={e.action === "ignored" ? "text-muted" : "text-foreground"}>{eventText(e)}</span>
                {e.detail && <span className="w-full truncate text-xs text-muted sm:ml-auto sm:w-auto sm:max-w-md" title={e.detail}>{e.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
