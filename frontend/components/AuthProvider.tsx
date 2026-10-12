"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, AUTH_EVENT, type Me } from "@/lib/api";

type AuthState = {
  user: Me | null;
  checked: boolean;
  setUser: (user: Me | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

export const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha"];

function loginUrl(reason?: string) {
  const here = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams();
  if (!PUBLIC_PATHS.includes(window.location.pathname) && here !== "/") params.set("next", here);
  if (reason) params.set("motivo", reason);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      setUser(null);
      const message = (e as CustomEvent<string>).detail;
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        router.replace(loginUrl(message?.startsWith("Faça login") ? undefined : message));
      }
    };
    window.addEventListener(AUTH_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_EVENT, onUnauthorized);
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  return <AuthContext.Provider value={{ user, checked, setUser, logout }}>{children}</AuthContext.Provider>;
}

/** Shows the page only to a logged-in user; public pages (login, password recovery) always render. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, checked } = useAuth();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (checked && !user && !isPublic) router.replace(loginUrl());
  }, [checked, user, isPublic, router]);

  if (isPublic || user) return children;
  return (
    <div role="status" className="grid flex-1 place-items-center text-sm text-muted">
      {checked ? "Redirecionando para o login..." : "Carregando..."}
    </div>
  );
}
