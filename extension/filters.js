// Shared by content.js and popup.js: the filter settings and how an ad is judged against them.
const GARIMPPU_FILTERS = {
  defaults: { minDays: 0, minSameCreative: 0, minPageAds: 0, withLink: false, dim: true },

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
    const days = GARIMPPU_FILTERS.daysActive(node);
    if (filters.minDays && days < filters.minDays) reasons.push(`${days} dias no ar`);
    const same = Number(node.collation_count) || 1;
    if (filters.minSameCreative && same < filters.minSameCreative) reasons.push(`${same} com este criativo`);
    if (filters.minPageAds && pageAds < filters.minPageAds) reasons.push(`${pageAds} do anunciante`);
    if (filters.withLink && !GARIMPPU_FILTERS.linkOf(node)) reasons.push("sem link");
    return reasons;
  },

  active(filters) {
    return Boolean(filters.minDays || filters.minSameCreative || filters.minPageAds || filters.withLink);
  },

  /** 0-100: time on air (caps at 60 days), ads sharing the creative (caps at 32) and advertiser's ads here (caps at 16). */
  heat(node, pageAds) {
    const days = Math.min(GARIMPPU_FILTERS.daysActive(node), 60) / 60;
    const same = Math.min(Math.log2(Number(node.collation_count) || 1) / 5, 1);
    const page = Math.min(Math.log2(pageAds || 1) / 4, 1);
    return Math.round(100 * (0.4 * days + 0.4 * same + 0.2 * page));
  },

  viewDefaults: { sort: "library", speed: "normal", stopAt: 0, collapsed: false },

  async loadView() {
    const { view } = await chrome.storage.local.get("view");
    return { ...GARIMPPU_FILTERS.viewDefaults, ...(view || {}) };
  },
};
