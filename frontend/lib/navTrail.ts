/**
 * The pages visited in this tab, with the full URL (filters live in the query string) and where the page was scrolled.
 * Filter changes replace the URL on the same path, so a new path is a step forward and the previous URL is a step back.
 */
export type TrailEntry = { url: string; path: string; label: string; scrollY: number; tab: string };

const KEY = "garimppu:trail";
const MAX = 30;

/** One id per page load: a duplicated tab or a reload gets a new one, so its history is not trusted for `history.back()`. */
export const TAB_ID = Math.random().toString(36).slice(2);

const LABELS: Record<string, string> = {
  "/": "Ofertas",
  "/criativos": "Criativos",
  "/sites": "Sites de venda",
  "/videos": "Vídeos",
  "/tiktok": "TikTok",
  "/palavras-chave": "Palavras-chave",
  "/colecoes": "Coleções",
  "/buscas": "Minerar",
};

/** What "Voltar para ..." names: the list by its menu name, a detail by its own title ("Favoritos", the advertiser). */
export function labelFor(path: string, search: string): string {
  if (path === "/criativos" && new URLSearchParams(search).has("offer")) return "a oferta";
  if (LABELS[path]) return LABELS[path];
  const title = typeof document !== "undefined" ? document.title.split(" · ")[0] : "";
  return title && title !== "Garimppu" ? title : "a página anterior";
}

export function readTrail(): TrailEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as TrailEntry[];
  } catch {
    return [];
  }
}

export function writeTrail(trail: TrailEntry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {}
}

/** The page before this one, or null when the tab started here. */
export function backTarget(): TrailEntry | null {
  const trail = readTrail();
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}
