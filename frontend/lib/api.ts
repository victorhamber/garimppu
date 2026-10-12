export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type Run = {
  id: number;
  status: "queued" | "running" | "done" | "error";
  started_at: string | null;
  finished_at: string | null;
  ads_found: number;
  creatives_found: number;
  error: string | null;
  log: string | null;
  created_at: string;
};

export type Search = {
  id: number;
  term: string;
  page_id: string | null;
  country: string;
  language: string | null;
  media_type: "all" | "image" | "video";
  niche: string | null;
  source: "scraper" | "api" | "hybrid";
  max_ads: number;
  refresh_hours: number | null;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  latest_run: Run | null;
  creatives_count: number;
  monitored_since: string;
  reused: boolean;
};

export type PageInfo = {
  page_id: string;
  name: string | null;
  profile_picture_url: string | null;
  page_like_count: number | null;
  active_ads_count: number;
  /** 2M+ likes or a known brand (Boticário, 99, Amazon...): affiliates can't promote it. */
  big_brand: boolean;
};

export type Score = {
  score: number;
  duplicates: number;
  days_active: number;
  platforms_count: number;
  growth_7d: number;
  page_active_ads: number;
  is_active: boolean;
};

export type Creative = {
  id: number;
  media_type: "image" | "video" | "text";
  image: string | null;
  video: string | null;
  niche: string | null;
  score: Score | null;
  page: PageInfo | null;
  body: string | null;
  title: string | null;
  cta_text: string | null;
  link_url: string | null;
  library_url: string | null;
  start_date: string | null;
  platforms: string[];
  ads_count: number;
  first_seen_at: string;
  collection_ids: number[];
  offer: OfferRef | null;
  /** False until the creative was seen on a second collection day; growth is meaningless before that. */
  has_history: boolean;
};

export type OfferRef = { key: string; label: string; kind: OfferKind; platform: string | null };

export type Ad = {
  ad_archive_id: string;
  page_id: string | null;
  body: string | null;
  title: string | null;
  caption: string | null;
  cta_text: string | null;
  link_url: string | null;
  display_format: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  platforms: string[];
  collation_count: number | null;
  source: string;
  library_url: string;
  last_seen_at: string;
};

export type CreativeDetail = Creative & {
  ads: Ad[];
  snapshots: { taken_on: string; active_ads: number }[];
};

export type OfferKind = "infoproduto" | "loja" | "app" | "conversa" | "site";

export type Offer = {
  key: string;
  label: string;
  kind: OfferKind;
  platform: string | null;
  url: string | null;
  score: number;
  advertisers: number;
  ads: number;
  creatives: number;
  days_active: number;
  first_seen_at: string;
  top_advertisers: { page_id: string; name: string | null; ads: number }[];
  previews: { creative_id: number; media_type: string; image: string | null; text: string | null }[];
  collection_ids: number[];
};

/** Cutoffs relative to the current result set; null when the set is too small to rank. */
export type ScoreHeat = { hot: number | null; warm: number | null };
export type CreativeHeat = ScoreHeat & { duplicates: number | null; days_active: number | null };

/** `hidden_brands`: results left out because they belong to big brands (0 when they're included). */
export type CreativePage = { total: number; items: Creative[]; heat: CreativeHeat; has_history: boolean; hidden_brands: number };
export type OfferPage = { total: number; items: Offer[]; platforms: string[]; heat: ScoreHeat; hidden_brands: number };

export const OFFER_KINDS: { id: OfferKind; label: string }[] = [
  { id: "infoproduto", label: "Infoproduto" },
  { id: "loja", label: "Loja / produto físico" },
  { id: "app", label: "App" },
  { id: "conversa", label: "WhatsApp / perfil" },
  { id: "site", label: "Site" },
];

export const OFFER_KIND_LABEL = Object.fromEntries(OFFER_KINDS.map((k) => [k.id, k.label])) as Record<OfferKind, string>;

/** Platform when known (Hotmart, Google Play...), else the offer kind. */
export function offerTag(offer: { kind: OfferKind; platform: string | null }): string {
  return offer.platform ?? OFFER_KIND_LABEL[offer.kind];
}

export type Me = { id: number; email: string; name: string | null; is_admin: boolean; expires_at: string | null };

export type LicenseEvent = { id: number; email: string; origin: string; action: string; detail: string | null; created_at: string };

export type LicenseStatus = "ativa" | "bloqueada" | "expirada" | "admin";

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  is_active: boolean;
  expires_at: string | null;
  status: LicenseStatus;
  created_at: string;
  last_login_at: string | null;
  searches_count: number;
  last_event: LicenseEvent | null;
};

export type AccessIssued = { user: AdminUser; emailed: boolean; temporary_password: string | null };

export type AdminSettings = { email_configured: boolean; webhook_configured: boolean };

export type WebhookSettings = { url: string | null; product_ids: string[]; access_days: number | null };

export type EmailProvider = "resend" | "smtp";

export type EmailSettings = {
  configured: boolean;
  provider: EmailProvider | null;
  has_resend_api_key: boolean;
  smtp_host: string | null;
  smtp_port: number;
  smtp_user: string | null;
  has_smtp_password: boolean;
  smtp_tls: boolean;
  from_email: string | null;
  from_name: string;
  access_subject: string;
  access_html: string;
  reset_subject: string;
  reset_html: string;
};

export type EmailTest = { ok: boolean; sent_to: string; error: string | null };

export type Collection = { id: number; name: string; created_at: string; items_count: number; offers_count: number };
export type Niche = { id: string; label: string };

export type CreativeFilters = {
  q?: string;
  search_id?: string;
  country?: string;
  niche?: string;
  media_type?: string;
  page_id?: string;
  offer?: string;
  collection_id?: string;
  min_days?: string;
  min_duplicates?: string;
  active_only?: string;
  include_brands?: string;
  /** "all" = the whole shared base; absent = only ads from the user's own searches. */
  scope?: string;
  sort?: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fired on any 401 outside the login call; the auth provider sends the user to /login with the message. */
export const AUTH_EVENT = "garimppu:unauthorized";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    if (res.status === 401 && !path.startsWith("/api/auth/login") && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: message }));
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${API_URL}${path}` : path;
}

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value);
  return new Date(value.length > 10 && !hasZone ? `${value}Z` : value);
}

export function formatDate(value: string | null): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("pt-BR") : "-";
}

export function formatDateTime(value: string | null): string {
  const d = parseDate(value);
  return d ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export function timeAgo(value: string | null): string | null {
  const d = parseDate(value);
  if (!d) return null;
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
  whatsapp: "WhatsApp",
};

export const PLATFORM_SHORT: Record<string, string> = {
  facebook: "FB",
  instagram: "IG",
  messenger: "MSG",
  audience_network: "AN",
  threads: "TH",
  whatsapp: "WA",
};
