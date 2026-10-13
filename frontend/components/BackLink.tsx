"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { backTarget, TAB_ID, type TrailEntry } from "@/lib/navTrail";

/**
 * Goes back to where the user came from, with its filters and scroll, when that page is known;
 * otherwise to `href`, the page's natural parent.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<TrailEntry | null>(null);

  useEffect(() => {
    // The trail is written by NavTrail's effect for this same navigation, so read it on the next frame.
    const frame = requestAnimationFrame(() => setTarget(backTarget()));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Link
      href={target?.url ?? href}
      onClick={(e) => {
        if (!target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (target.tab === TAB_ID) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex w-fit items-center gap-1 self-start py-0.5 text-sm text-muted transition-colors hover:text-foreground pointer-coarse:min-h-11"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {target ? `Voltar para ${target.label}` : children}
    </Link>
  );
}
