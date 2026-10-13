"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Me } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { SupportLink } from "./SupportLink";

/** Only same-app paths: "//evil.com" or "https://..." would turn the login into an open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("motivo"));
  const [submitting, setSubmitting] = useState(false);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const me = await api<Me>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setUser(me);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="grid flex-1 place-items-center py-10">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">Use o e-mail da sua compra e a senha que você recebeu.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" required autoFocus className="field"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className="label" htmlFor="password">Senha</label>
            <Link href="/esqueci-senha" className="text-xs text-muted underline decoration-line underline-offset-2 hover:text-foreground">
              Esqueci minha senha
            </Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" required className="field"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
        <p className="text-xs leading-relaxed text-muted">
          O acesso não chegou? Confira o spam ou fale com <SupportLink />.
        </p>
      </form>
    </div>
  );
}
