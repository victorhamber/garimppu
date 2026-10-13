"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useMining } from "@/lib/hooks";
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

const barClass = (active: boolean) =>
  `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-micro transition-colors ${
    active ? "text-foreground" : "text-muted active:text-foreground"
  }`;

const ICONS = {
  offers: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  creatives: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  sources: (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  collections: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  mine: (
    <>
      <path d="M14.5 12.5 6.6 20.4a1.4 1.4 0 0 1-2-2l7.9-7.9" />
      <path d="M15.7 4.3A12.5 12.5 0 0 0 5.5 3a1 1 0 0 0 .1 1.7 22 22 0 0 1 6.3 3.4" />
      <path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
      <path d="M19.7 8.3A12.5 12.5 0 0 1 21 18.5a1 1 0 0 1-1.7-.1 22 22 0 0 0-3.4-6.3" />
    </>
  ),
};

function Icon({ name, active }: { name: keyof typeof ICONS; active?: boolean }) {
  return (
    <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-surface-2" : ""}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[name]}
      </svg>
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const mining = isActive("/buscas");
  const source = SOURCES.find((s) => isActive(s.href));
  const running = useMining(!!user);
  const [seenRunning, setSeenRunning] = useState(running);
  const [finished, setFinished] = useState(false);
  if (running !== seenRunning) {
    setSeenRunning(running);
    setFinished(seenRunning > 0 && running === 0);
  }
  if (finished && mining) setFinished(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-8 px-4 sm:px-6 lg:h-14 lg:flex-nowrap">
          <Link href="/" aria-label="Garimppu: início" className="flex h-12 shrink-0 items-center gap-2 font-semibold tracking-tight lg:h-auto">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded bg-accent font-mono text-sm font-bold text-accent-ink">
              G
            </span>
            <span className="whitespace-nowrap">Garimppu</span>
            <span className="hidden text-sm font-normal whitespace-nowrap text-muted xl:inline">ofertas e criativos escalados</span>
          </Link>
          {user && (
            <>
              <div className="ml-auto flex items-center gap-2 lg:order-last">
                <div role="status" aria-label="Coleta" className="contents">
                  {running > 0 && (
                    <Link href="/buscas" title={`${running} ${running === 1 ? "busca coletando ou na fila" : "buscas coletando ou na fila"}`}
                      className="inline-flex min-h-6 items-center gap-1.5 rounded bg-accent/15 px-2 py-1 text-xs font-medium whitespace-nowrap text-accent transition-colors hover:bg-accent/25 pointer-coarse:min-h-11">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                      Coletando{running > 1 && <span className="font-mono tabular-nums">{running}</span>}
                    </Link>
                  )}
                  {finished && (
                    <Link href="/buscas" title="A coleta terminou. Ver em Minerar" onClick={() => setFinished(false)}
                      className="inline-flex min-h-6 items-center gap-1.5 rounded bg-ok/15 px-2 py-1 text-xs font-medium whitespace-nowrap text-ok transition-colors hover:bg-ok/25 pointer-coarse:min-h-11">
                      <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                        <path d="M5 12.5 10 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Pronto
                    </Link>
                  )}
                </div>
                <Link
                  href="/buscas"
                  aria-current={mining ? "page" : undefined}
                  className={`btn btn-primary hidden h-8 md:inline-flex pointer-coarse:h-11 ${mining ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-background" : ""}`}
                >
                  Minerar
                </Link>
                <AccountMenu />
              </div>
              <nav aria-label="Principal" className="-mx-1 hidden w-full grid-cols-4 gap-1 pb-2 md:grid lg:mx-0 lg:flex lg:w-auto lg:items-center lg:pb-0">
                <Link href="/" aria-current={isActive("/") ? "page" : undefined} className={tabClass(isActive("/"))}>Ofertas</Link>
                <Link href="/criativos" aria-current={isActive("/criativos") ? "page" : undefined} className={tabClass(isActive("/criativos"))}>
                  Criativos
                </Link>
                <SourcesMenu current={source} />
                <Link href="/colecoes" aria-current={isActive("/colecoes") ? "page" : undefined} className={tabClass(isActive("/colecoes"))}>
                  Coleções
                </Link>
              </nav>
            </>
          )}
        </div>
      </header>
      {user && (
        <nav aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <Link href="/" aria-current={isActive("/") ? "page" : undefined} className={barClass(isActive("/"))}>
            <Icon name="offers" active={isActive("/")} />Ofertas
          </Link>
          <Link href="/criativos" aria-current={isActive("/criativos") ? "page" : undefined} className={barClass(isActive("/criativos"))}>
            <Icon name="creatives" active={isActive("/criativos")} />Criativos
          </Link>
          <SourcesMenu current={source} bar />
          <Link href="/colecoes" aria-current={isActive("/colecoes") ? "page" : undefined} className={barClass(isActive("/colecoes"))}>
            <Icon name="collections" active={isActive("/colecoes")} />Coleções
          </Link>
          <Link href="/buscas" aria-current={mining ? "page" : undefined} className={barClass(mining)}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full bg-accent text-accent-ink ${mining ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-background" : ""}`}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75}
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS.mine}
              </svg>
            </span>
            Minerar
          </Link>
        </nav>
      )}
    </>
  );
}

function SourcesMenu({ current, bar = false }: { current?: (typeof SOURCES)[number]; bar?: boolean }) {
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
        aria-label={bar ? `Fontes${current ? `: ${current.label}` : ""}` : undefined}
        className={bar ? barClass(!!current || open) : `${tabClass(!!current)} w-full`}
      >
        {bar ? (
          <>
            <Icon name="sources" active={!!current || open} />
            {current?.short ?? "Fontes"}
          </>
        ) : (
          <>
            Fontes
            {current && <span className="hidden text-muted sm:inline">· {current.short}</span>}
            <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none"
              stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>
      {open && (
        <nav id={menuId} aria-label="Fontes" onClick={() => setOpen(false)}
          className={`absolute z-40 w-56 rounded-md border border-line bg-surface p-1 shadow-xl ${
            bar ? "bottom-full left-1/2 mb-2 -translate-x-1/2" : "right-0 top-full mt-1 lg:right-auto lg:left-0"
          }`}>
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
        </nav>
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
        <div id={menuId} role="group" aria-label="Conta" onClick={() => setOpen(false)}
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
