"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, type Me } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { SupportLink } from "./SupportLink";

function Card({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center py-10">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">{intro}</p>
        </div>
        {children}
        <Link href="/login"
          className="inline-flex min-h-6 items-center self-start text-xs text-muted underline decoration-line underline-offset-2 hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:text-sm">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{text}</p>;
}

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Card title="Confira seu e-mail" intro={`Se ${email} tiver uma licença ativa, enviamos um link para criar uma senha nova. Ele vale por 1 hora.`}>
        <p className="text-xs text-muted">Não chegou em alguns minutos? Confira o spam ou fale com <SupportLink />.</p>
      </Card>
    );
  }

  return (
    <Card title="Esqueci minha senha" intro="Informe o e-mail da sua compra. Enviamos um link para você criar uma senha nova.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert text={error} />}
        <div>
          <label className="label" htmlFor="fp-email">E-mail</label>
          <input id="fp-email" type="email" autoComplete="email" required autoFocus className="field"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={sending}>{sending ? "Enviando..." : "Enviar link"}</button>
      </form>
    </Card>
  );
}

export function ResetPasswordView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "Link incompleto. Abra o link do e-mail de novo ou peça outro.");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const me = await api<Me>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, new_password: password }) });
      setUser(me);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Card title="Criar senha nova" intro="Escolha a senha que você vai usar para entrar no Garimppu.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert text={error} />}
        <div>
          <label className="label" htmlFor="rp-new">Nova senha</label>
          <input id="rp-new" type="password" autoComplete="new-password" required minLength={8} autoFocus className="field"
            value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="rp-hint" />
          <p id="rp-hint" className="mt-1 text-xs text-muted">Mínimo de 8 caracteres.</p>
        </div>
        <div>
          <label className="label" htmlFor="rp-confirm">Repita a nova senha</label>
          <input id="rp-confirm" type="password" autoComplete="new-password" required minLength={8} className="field"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={saving || !token}>{saving ? "Salvando..." : "Salvar e entrar"}</button>
      </form>
      {error && !token && (
        <Link href="/esqueci-senha"
          className="inline-flex min-h-6 items-center self-start text-sm text-foreground underline decoration-line underline-offset-2 hover:decoration-accent pointer-coarse:min-h-11">
          Pedir um link novo
        </Link>
      )}
    </Card>
  );
}
