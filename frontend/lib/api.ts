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
  source: "scraper" | "api" | "hybrid" | "youtube" | "tiktok" | "sites" | "trends";
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
  /** Organic videos (YouTube) whose description links to this offer. */
  videos: number;
  /** TikTok Creative Center top ads landing on this offer. */
  tiktok_ads: number;
  /** Best position of the offer's site in a collected sites ranking, and that ranking's label. */
  site_rank: number | null;
  site_ranking: string | null;
  /** Meta plus TikTok, YouTube and/or a sites ranking when the offer shows up there too. */
  platforms: number;
};

export type Video = {
  id: string;
  platform: "youtube";
  external_id: string;
  url: string;
  title: string | null;
  channel_id: string | null;
  channel_title: string | null;
  channel_subscribers: number | null;
  thumbnail_url: string | null;
  duration_s: number | null;
  is_short: boolean;
  published_at: string;
  niche: string | null;
  language: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
  link_url: string | null;
  offer_key: string | null;
  offer_label: string | null;
  offer_kind: OfferKind | null;
  offer_platform: string | null;
  score: number;
  /** Views per day since publication. */
  velocity: number;
  /** Views ÷ channel subscribers; null when the channel hides them. */
  outlier: number | null;
  /** (likes + 2×comments) ÷ views. */
  engagement: number | null;
  /** Recent views/day ÷ lifetime views/day; needs two collections a day apart. */
  acceleration: number | null;
  first_seen_at: string;
  collection_ids: number[];
};

/** `enabled`: false while the server has no YOUTUBE_API_KEY. */
export type VideoPage = { total: number; items: Video[]; heat: ScoreHeat; enabled: boolean };

/** A TikTok Creative Center top ad (auction ads TikTok itself ranks as top performers). */
export type TikTokAd = {
  id: string;
  /** Creative Center detail page, where the video plays. */
  url: string;
  country: string;
  title: string | null;
  brand: string | null;
  industry: string | null;
  industry_id: number | null;
  objective: string | null;
  /** CTR percentile within the industry: 0.05 = top 5%. */
  ctr_rank: number | null;
  likes: number;
  comments: number | null;
  shares: number | null;
  /** TikTok's spend band: 0 low, 1 medium, 2 high. */
  budget: number | null;
  duration_s: number | null;
  cover: string | null;
  landing_page: string | null;
  offer_key: string | null;
  offer_label: string | null;
  score: number;
  first_seen_at: string;
  collection_ids: number[];
};

export type TikTokAdPage = { total: number; items: TikTokAd[]; heat: ScoreHeat };

/** A sales site (the advertiser's own domain) found behind the collected ads. */
export type Site = {
  domain: string;
  url: string;
  niche: string | null;
  /** Store platform, e.g. Shopify. */
  platform: string | null;
  score: number;
  advertisers: number;
  ads: number;
  creatives: number;
  products: number;
  days_active: number;
  first_seen_at: string;
  last_seen_at: string;
  tiktok_ads: number;
  videos: number;
  top_advertisers: Offer["top_advertisers"];
  previews: Offer["previews"];
  collection_ids: number[];
};

export type SitePage = { total: number; items: Site[]; heat: ScoreHeat; hidden_brands: number };
export type TikTokIndustry = { id: number; label: string };

/** A term from Google Trends "trending now"; traffic is Google's approximate search count ("20000+"). */
export type Keyword = {
  id: number;
  term: string;
  geo: string;
  niche: string | null;
  traffic: number | null;
  peak_traffic: number | null;
  /** Traffic on the previous day it trended, for growth. */
  previous_traffic: number | null;
  days_trending: number;
  sightings: number;
  trending_now: boolean;
  news: { title: string; url: string; source: string }[];
  picture_url: string | null;
  /** Collected Meta ads mentioning the term (capped at 100); null when the term is too short to match. */
  meta_ads: number | null;
  first_seen_at: string;
  last_seen_at: string;
  collection_ids: number[];
};
export type KeywordPage = { total: number; items: Keyword[]; heat: ScoreHeat; countries: string[] };

export type KeywordSuggestion = {
  term: string;
  popularity: number;
  hits: number;
  niche: string | null;
  meta_ads: number | null;
  trending: boolean;
};
export type KeywordSuggestions = { term: string; country: string; items: KeywordSuggestion[] };

/**
 * Cutoffs relative to the current result set; null/absent when the set is too small to rank.
 * `metrics`: per-metric value reaching the top 10% (for `ctr_rank`, lower is better).
 */
export type ScoreHeat = { hot: number | null; warm: number | null; metrics?: Record<string, number> };

/** `hidden_brands`: results left out because they belong to big brands (0 when they're included). */
export type CreativePage = { total: number; items: Creative[]; heat: ScoreHeat; has_history: boolean; hidden_brands: number };
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

export type Collection = {
  id: number;
  name: string;
  created_at: string;
  items_count: number;
  offers_count: number;
  /** Videos, TikTok ads, sites and keywords. */
  refs_count: number;
};
export type CollectionRefKind = "video" | "tiktok" | "site" | "keyword";
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
/** Fired when a search is created or run, so the nav's "Coletando" indicator refreshes at once. */
export const MINING_EVENT = "garimppu:mining";

const REQUEST_TIMEOUT_MS = 60_000;
const MINING_PATH = /^\/api\/searches(\/\d+\/run)?$/;

/** FastAPI puts the reason in `detail`: a string, or a list of field errors on 422. */
function detailOf(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => (d as { msg?: string }).msg).filter(Boolean);
    return msgs.length ? `Dados inválidos: ${msgs.join("; ")}` : null;
  }
  return null;
}

/** The reason shown to the user: the server's own words when it gave them, otherwise what the status means. */
function reasonFor(status: number, detail: string | null): string {
  if (detail && status < 500) return detail;
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Sua conta não tem acesso a isto.";
  if (status === 404) return "Não encontrado: o item pode ter sido excluído.";
  if (status === 429) return "Muitas requisições seguidas. Espere alguns segundos.";
  if (status === 502 || status === 503 || status === 504) return `O servidor do Garimppu está fora do ar ou reiniciando (erro ${status}).`;
  return `O servidor do Garimppu teve um erro interno (erro ${status})${detail ? `: ${detail}` : "."}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      credentials: "include",
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    throw new ApiError(0, timedOut
      ? "O servidor do Garimppu demorou demais para responder."
      : offline ? "Sem internet. Confira sua conexão." : "Sem conexão com o servidor do Garimppu.");
  }
  if (!res.ok) {
    let detail: string | null = null;
    try {
      detail = detailOf(await res.json());
    } catch {}
    const message = reasonFor(res.status, detail);
    if (res.status === 401 && !path.startsWith("/api/auth/login") && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: message }));
    }
    throw new ApiError(res.status, message);
  }
  if (init?.method === "POST" && MINING_PATH.test(path) && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MINING_EVENT));
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
