"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { labelFor, readTrail, TAB_ID, writeTrail, type TrailEntry } from "@/lib/navTrail";

const RESTORE_TIMEOUT_MS = 4000;

/** Lists load after the page renders, so the old scroll position only fits once the content has arrived. */
function restoreScroll(y: number) {
  if (y <= 0) return;
  const started = Date.now();
  const step = () => {
    if (document.documentElement.scrollHeight >= y + window.innerHeight || Date.now() - started > RESTORE_TIMEOUT_MS) {
      window.scrollTo(0, y);
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Records the tab's trail of pages for `BackLink`; renders nothing. */
export function NavTrail() {
  const path = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const url = `${path}${search ? `?${search}` : ""}`;
    const trail = readTrail();
    const top = trail.at(-1);
    const previous = trail.at(-2);
    const entry: TrailEntry = { url, path, label: labelFor(path, search), scrollY: 0, tab: TAB_ID };

    if (previous && previous.url === url) {
      trail.pop();
      trail[trail.length - 1] = { ...previous, tab: TAB_ID };
      restoreScroll(previous.scrollY);
    } else if (top && top.path === path) {
      trail[trail.length - 1] = { ...entry, scrollY: top.url === url ? top.scrollY : 0 };
    } else {
      trail.push(entry);
    }
    writeTrail(trail);

    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (`${location.pathname}${location.search}` !== url) return;
        const current = readTrail();
        const last = current.at(-1);
        if (!last || last.url !== url) return;
        current[current.length - 1] = { ...last, scrollY: window.scrollY, label: labelFor(path, search) };
        writeTrail(current);
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    const titleTimer = setTimeout(save, 1500);
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(frame);
      clearTimeout(titleTimer);
    };
  }, [path, search]);

  return null;
}
