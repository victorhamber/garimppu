"use client";

import { useEffect, useState } from "react";
import { api, type EmailProvider, type EmailSettings, type EmailTest } from "@/lib/api";
import { digitsOnly } from "@/lib/useUrlFilters";

type Form = {
  provider: EmailProvider | "";
  resend_api_key: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  smtp_tls: boolean;
  from_email: string;
  from_name: string;
  access_subject: string;
  access_html: string;
  reset_subject: string;
  reset_html: string;
};

function toForm(s: EmailSettings): Form {
  return {
    provider: s.provider ?? "",
    resend_api_key: "",
    smtp_host: s.smtp_host ?? "",
    smtp_port: String(s.smtp_port),
    smtp_user: s.smtp_user ?? "",
    smtp_password: "",
    smtp_tls: s.smtp_tls,
    from_email: s.from_email ?? "",
    from_name: s.from_name,
    access_subject: s.access_subject,
    access_html: s.access_html,
    reset_subject: s.reset_subject,
    reset_html: s.reset_html,
  };
}

const PROVIDERS: { id: Form["provider"]; label: string }[] = [
  { id: "resend", label: "Resend" },
  { id: "smtp", label: "SMTP" },
  { id: "", label: "Desativado" },
];

export function EmailSettingsView() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api<EmailSettings>("/api/admin/email")
      .then((s) => {
        setSettings(s);
        setForm(toForm(s));
      })
      .catch((e: Error) => setMessage({ ok: false, text: e.message }));
  }, []);

  if (!form || !settings) {
    return message ? <p role="alert" className="text-sm text-danger">{message.text}</p> : <p className="text-sm text-muted">Carregando...</p>;
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => f && { ...f, [key]: value });

  async function persist(): Promise<EmailSettings> {
    const saved = await api<EmailSettings>("/api/admin/email", {
      method: "PUT",
      body: JSON.stringify({ ...form, provider: form!.provider || null, smtp_port: Number(form!.smtp_port) || 587 }),
    });
    setSettings(saved);
    setForm(toForm(saved));
    return saved;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await persist();
      setMessage({ ok: true, text: saved.configured ? "Configuração salva." : "Salvo, mas o envio ainda está incompleto: confira provedor, chave e remetente." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    try {
      await persist();
      const result = await api<EmailTest>("/api/admin/email/test", { method: "POST" });
      setMessage(result.ok
        ? { ok: true, text: `E-mail de teste enviado para ${result.sent_to}. Confira a caixa de entrada e o spam.` }
        : { ok: false, text: result.error ?? "Falha no envio." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">E-mail</h1>
        <p className="mt-1 text-sm">
          {settings.configured ? <span className="text-ok">Envio ativo</span> : <span className="text-muted">Envio desativado</span>}
        </p>
      </div>

      <section aria-labelledby="em-provider" className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-2">
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <h2 id="em-provider" className="mr-auto text-lg font-semibold">Provedor e remetente</h2>
          <div role="radiogroup" aria-labelledby="em-provider" className="flex items-center gap-0.5 rounded-md border border-line p-0.5 text-sm">
            {PROVIDERS.map((p) => (
              <button key={p.label} type="button" role="radio" aria-checked={form.provider === p.id} onClick={() => set("provider", p.id)}
                className={`rounded px-2.5 py-1 transition-colors pointer-coarse:min-h-11 ${
                  form.provider === p.id ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {form.provider === "resend" && (
          <div className="md:col-span-2">
            <label className="label" htmlFor="em-resend">Chave da API do Resend</label>
            <input id="em-resend" type="password" autoComplete="off" className="field font-mono" value={form.resend_api_key}
              onChange={(e) => set("resend_api_key", e.target.value)}
              placeholder={settings.has_resend_api_key ? "Já configurada: cole outra só para trocar" : "re_..."} aria-describedby="em-resend-hint" />
            <p id="em-resend-hint" className="mt-1 text-xs text-muted">
              Crie em resend.com, em API Keys. O domínio do e-mail do remetente precisa estar verificado no Resend.
            </p>
          </div>
        )}

        {form.provider === "smtp" && (
          <>
            <div>
              <label className="label" htmlFor="em-host">Servidor SMTP</label>
              <input id="em-host" className="field" value={form.smtp_host} onChange={(e) => set("smtp_host", e.target.value)}
                placeholder="smtp.seuprovedor.com" />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="label" htmlFor="em-port">Porta</label>
                <input id="em-port" inputMode="numeric" className="field" value={form.smtp_port}
                  onChange={(e) => set("smtp_port", digitsOnly(e.target.value))} />
              </div>
              <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted pointer-coarse:h-11">
                <input type="checkbox" className="accent-[var(--accent)]" checked={form.smtp_tls} onChange={(e) => set("smtp_tls", e.target.checked)} />
                STARTTLS
              </label>
            </div>
            <div>
              <label className="label" htmlFor="em-user">Usuário</label>
              <input id="em-user" autoComplete="off" className="field" value={form.smtp_user} onChange={(e) => set("smtp_user", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="em-pass">Senha</label>
              <input id="em-pass" type="password" autoComplete="new-password" className="field" value={form.smtp_password}
                onChange={(e) => set("smtp_password", e.target.value)}
                placeholder={settings.has_smtp_password ? "Já configurada: digite outra só para trocar" : ""} />
            </div>
          </>
        )}

        {form.provider && (
          <>
            <div>
              <label className="label" htmlFor="em-from-name">Nome do remetente</label>
              <input id="em-from-name" className="field" value={form.from_name} onChange={(e) => set("from_name", e.target.value)} placeholder="Garimppu" />
            </div>
            <div>
              <label className="label" htmlFor="em-from">E-mail do remetente</label>
              <input id="em-from" type="email" className="field" value={form.from_email} onChange={(e) => set("from_email", e.target.value)}
                placeholder="contato@seudominio.com" />
            </div>
          </>
        )}
      </section>

      <Template id="access" title="Dados de acesso" hint="Enviado quando a licença é criada e quando você gera uma nova senha."
        placeholders={["name", "email", "password", "login_url"]}
        subject={form.access_subject} html={form.access_html}
        onSubject={(v) => set("access_subject", v)} onHtml={(v) => set("access_html", v)} />
      <Template id="reset" title="Esqueci minha senha" hint="Enviado quando o cliente pede um link na tela de login. O link vale por 1 hora."
        placeholders={["name", "email", "reset_link"]}
        subject={form.reset_subject} html={form.reset_html}
        onSubject={(v) => set("reset_subject", v)} onHtml={(v) => set("reset_html", v)} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {message && (
          <p role="status" className={`mr-auto text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</p>
        )}
        <button type="button" className="btn" onClick={test} disabled={testing || saving || !form.provider}>
          {testing ? "Enviando..." : "Salvar e enviar teste"}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || testing}>{saving ? "Salvando..." : "Salvar"}</button>
      </div>
    </form>
  );
}

const SAMPLES: Record<string, string> = {
  name: "Maria",
  email: "maria@exemplo.com",
  password: "Kp7vXq2mR9tw",
  login_url: "#",
  reset_link: "#",
};

function withSamples(html: string) {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => SAMPLES[key] ?? match);
}

function Template(props: {
  id: string; title: string; hint: string; placeholders: string[];
  subject: string; html: string; onSubject: (v: string) => void; onHtml: (v: string) => void;
}) {
  return (
    <section aria-labelledby={`tpl-${props.id}`} className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div>
        <h2 id={`tpl-${props.id}`} className="text-lg font-semibold">Modelo: {props.title}</h2>
        <p className="mt-0.5 text-sm text-muted">{props.hint}</p>
        <p className="mt-1 text-xs text-muted">
          Variáveis:{" "}
          {props.placeholders.map((p, i) => (
            <span key={p}>{i > 0 && ", "}<code className="font-mono text-foreground">{`{{${p}}}`}</code></span>
          ))}
          . Apague o conteúdo e salve para voltar ao modelo padrão.
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`tpl-${props.id}-subject`}>Assunto</label>
        <input id={`tpl-${props.id}-subject`} className="field" value={props.subject} onChange={(e) => props.onSubject(e.target.value)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor={`tpl-${props.id}-html`}>HTML</label>
          <textarea id={`tpl-${props.id}-html`} rows={12} spellCheck={false}
            className="field h-auto min-h-64 py-2 font-mono text-xs leading-relaxed" value={props.html}
            onChange={(e) => props.onHtml(e.target.value)} />
        </div>
        <div>
          <span className="label">Prévia</span>
          <iframe title={`Prévia: ${props.title}`} sandbox="" srcDoc={withSamples(props.html)}
            className="h-64 min-h-64 w-full rounded-md border border-line bg-white lg:h-[calc(100%-1.5rem)]" />
        </div>
      </div>
    </section>
  );
}
