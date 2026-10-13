"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

const LINKS = [
  { href: "/", label: "Explorar" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/videos", label: "Vídeos" },
  { href: "/tiktok", label: "TikTok" },
  { href: "/sites", label: "Sites" },
  { href: "/buscas", label: "Minerar" },
  { href: "/colecoes", label: "Coleções" },
];

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-8 px-4 sm:h-14 sm:flex-nowrap sm:px-6">
        <Link href="/" className="flex h-12 shrink-0 items-center gap-2 font-semibold tracking-tight sm:h-auto">
          <span className="grid size-7 place-items-center rounded bg-accent font-mono text-sm font-bold text-accent-ink">
            G
          </span>
          <span className="whitespace-nowrap">Garimppu</span>
          <span className="hidden text-sm font-normal whitespace-nowrap text-muted md:inline">ofertas e criativos escalados</span>
        </Link>
        {user && (
          <>
            <div className="ml-auto sm:order-last">
              <AccountMenu />
            </div>
            <nav className="-mx-1 grid w-full grid-cols-4 gap-1 pb-2 sm:mx-0 sm:flex sm:w-auto sm:items-center sm:pb-0">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`flex items-center justify-center rounded-md px-2 py-1.5 text-sm sm:px-3 whitespace-nowrap transition-colors pointer-coarse:min-h-11 ${
                    isActive(link.href) ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>
    </header>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) return null;
  const label = user.name || user.email;
  const itemClass = "flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2 pointer-coarse:py-3";

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        className="flex h-9 max-w-48 items-center gap-2 rounded-md px-2 text-sm text-muted transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs text-foreground">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="hidden truncate lg:inline">{label}</span>
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Conta de {label}</span>
      </button>
      {open && (
        <div id={menuId} onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded-md border border-line bg-surface p-1 shadow-xl">
          <p className="truncate px-2 py-1.5 text-xs text-muted" title={user.email}>{user.email}</p>
          <Link href="/conta" className={itemClass}>Minha conta</Link>
          {user.is_admin && <Link href="/admin" className={itemClass}>Licenças</Link>}
          <button type="button" onClick={logout} className={itemClass}>Sair</button>
        </div>
      )}
    </div>
  );
}
