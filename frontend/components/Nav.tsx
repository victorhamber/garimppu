"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

const SOURCES = [
  { href: "/videos", label: "Vídeos do YouTube", short: "YouTube" },
  { href: "/tiktok", label: "Anúncios do TikTok", short: "TikTok" },
  { href: "/sites", label: "Sites de venda", short: "Sites" },
  { href: "/palavras-chave", label: "Palavras-chave", short: "Palavras" },
];

const tabClass = (active: boolean) =>
  `flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm lg:px-3 whitespace-nowrap transition-colors pointer-coarse:min-h-11 ${
    active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
  }`;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const mining = isActive("/buscas");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-8 px-4 sm:px-6 lg:h-14 lg:flex-nowrap">
        <Link href="/" className="flex h-12 shrink-0 items-center gap-2 font-semibold tracking-tight lg:h-auto">
          <span className="grid size-7 place-items-center rounded bg-accent font-mono text-sm font-bold text-accent-ink">
            G
          </span>
          <span className="whitespace-nowrap">Garimppu</span>
          <span className="hidden text-sm font-normal whitespace-nowrap text-muted xl:inline">ofertas e criativos escalados</span>
        </Link>
        {user && (
          <>
            <div className="ml-auto flex items-center gap-2 lg:order-last">
              <Link
                href="/buscas"
                aria-current={mining ? "page" : undefined}
                className={`btn btn-primary h-8 pointer-coarse:h-11 ${mining ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-background" : ""}`}
              >
                Minerar
              </Link>
              <AccountMenu />
            </div>
            <nav aria-label="Principal" className="-mx-1 grid w-full grid-cols-4 gap-1 pb-2 lg:mx-0 lg:flex lg:w-auto lg:items-center lg:pb-0">
              <Link href="/" aria-current={isActive("/") ? "page" : undefined} className={tabClass(isActive("/"))}>Ofertas</Link>
              <Link href="/criativos" aria-current={isActive("/criativos") ? "page" : undefined} className={tabClass(isActive("/criativos"))}>
                Criativos
              </Link>
              <SourcesMenu current={SOURCES.find((s) => isActive(s.href))} />
              <Link href="/colecoes" aria-current={isActive("/colecoes") ? "page" : undefined} className={tabClass(isActive("/colecoes"))}>
                Coleções
              </Link>
            </nav>
          </>
        )}
      </div>
    </header>
  );
}

function SourcesMenu({ current }: { current?: (typeof SOURCES)[number] }) {
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
        className={`${tabClass(!!current)} w-full`}
      >
        Fontes
        {current && <span className="hidden text-muted sm:inline">· {current.short}</span>}
        <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none"
          stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={menuId} onClick={() => setOpen(false)} className="absolute right-0 top-full z-40 mt-1 w-56 lg:right-auto lg:left-0 rounded-md border border-line bg-surface p-1 shadow-xl">
          {SOURCES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={current?.href === s.href ? "page" : undefined}
              className={`flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface-2 pointer-coarse:py-3 ${
                current?.href === s.href ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </div>
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
