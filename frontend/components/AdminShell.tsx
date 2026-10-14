"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

const TABS = [
  { href: "/admin", label: "Licenças" },
  { href: "/admin/webhook", label: "Webhook de compra" },
  { href: "/admin/email", label: "E-mail" },
  { href: "/admin/leads", label: "Leads da extensão" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user?.is_admin) {
    return <p className="text-muted">Área restrita a administradores.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Administração" className="-mb-2 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
              className={`-mb-px flex items-center border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors pointer-coarse:min-h-11 ${
                active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
