// Shared by content.js and popup.js: the filter settings and how an ad is judged against them.
const GARIMPPU_FILTERS = {
  defaults: { minNota: 0, minDays: 0, minSameCreative: 0, minPageAds: 0, withLink: false, dim: true },

  async load() {
    const { filters } = await chrome.storage.local.get("filters");
    return { ...GARIMPPU_FILTERS.defaults, ...(filters || {}) };
  },

  daysActive(node) {
    const start = Number(node.start_date);
    return start ? Math.max(0, Math.floor((Date.now() - start * 1000) / 86_400_000)) : 0;
  },

  linkOf(node) {
    const snapshot = node.snapshot || {};
    return snapshot.link_url || (snapshot.cards || []).find((card) => card.link_url)?.link_url || null;
  },

  /** Reasons the ad fails; empty when it passes. pageAds = ads of the same advertiser seen in this search. */
  failures(node, filters, pageAds) {
    const reasons = [];
    const nota = GARIMPPU_FILTERS.nota(node, pageAds);
    if (filters.minNota && nota < filters.minNota) reasons.push(`pontuação ${nota}`);
    const days = GARIMPPU_FILTERS.daysActive(node);
    if (filters.minDays && days < filters.minDays) reasons.push(`${days} dias ativo`);
    const same = Number(node.collation_count) || 1;
    if (filters.minSameCreative && same < filters.minSameCreative) reasons.push(`${same} iguais`);
    if (filters.minPageAds && pageAds < filters.minPageAds) reasons.push(`${pageAds} desta página`);
    if (filters.withLink && !GARIMPPU_FILTERS.linkOf(node)) reasons.push("sem link de venda");
    return reasons;
  },

  active(filters) {
    return Boolean(filters.minNota || filters.minDays || filters.minSameCreative || filters.minPageAds || filters.withLink);
  },

  /**
   * The app's creative nota (backend pipeline/scoring.py) without growth, which needs a 2nd collection:
   * ads with this creative 35 (fills at 30), days on air 25 (60), advertiser's ads 15 (100), placements 10 (4).
   * The advertiser's ads are the ones seen in this search, so the extension may read a little lower than the app.
   */
  nota(node, pageAds) {
    const log = (value, cap) => Math.min(Math.log2(1 + Math.max(value, 0)) / Math.log2(1 + cap), 1);
    const same = Number(node.collation_count) || 1;
    const placements = (node.publisher_platform || node.publisher_platforms || []).length;
    const points = 35 * log(same - 1, 29) + 25 * Math.min(GARIMPPU_FILTERS.daysActive(node) / 60, 1)
      + 15 * log(pageAds, 100) + 10 * Math.min(placements / 4, 1);
    return Math.round((points * 100) / 85);
  },

  /** Same cut points as the app (backend pipeline/nota.py). */
  tier(nota) {
    if (nota >= 65) return { label: "forte", tone: "escalado", color: "#ff6b3d", ink: "#1a1206" };
    if (nota >= 50) return { label: "boa", tone: "quente", color: "#f2a93b", ink: "#1a1206" };
    if (nota >= 35) return { label: "média", tone: "morno", color: "#1d2024", ink: "#e8e6e1" };
    return { label: "baixa", tone: "frio", color: "transparent", ink: "#8d9096" };
  },

  viewDefaults: { sort: "library", speed: "normal", stopAt: 0, collapsed: false },

  async loadView() {
    const { view } = await chrome.storage.local.get("view");
    return { ...GARIMPPU_FILTERS.viewDefaults, ...(view || {}) };
  },
};
