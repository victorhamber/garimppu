"use client";

import { useSyncExternalStore } from "react";

export type GridView = "grid" | "list";

const KEY = "garimppu:view";
const EVENT = "garimppu:view";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

const read = (): GridView => (localStorage.getItem(KEY) === "list" ? "list" : "grid");

/** Grid or compact list, remembered per browser and shared by every creative listing. */
export function useViewPreference(): [GridView, (view: GridView) => void] {
  const view = useSyncExternalStore(subscribe, read, () => "grid" as GridView);
  const setView = (next: GridView) => {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [view, setView];
}
