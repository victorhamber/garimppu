const DEFAULT_API = "https://api.garimppu.com";
const LEAD_PING_MS = 24 * 3_600_000;

async function apiBase() {
  const { apiBase: base } = await chrome.storage.local.get("apiBase");
  return base || DEFAULT_API;
}

async function call(path, { method = "GET", body, auth = true } = {}) {
  const { account } = await chrome.storage.local.get("account");
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    if (!account?.token) return { ok: false, status: 401, error: "Entre com sua senha do Garimppu para enviar ao app." };
    headers.Authorization = `Bearer ${account.token}`;
  }
  try {
    const response = await fetch((await apiBase()) + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : `O Garimppu respondeu com erro ${response.status}.`;
      return { ok: false, status: response.status, error: detail };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "Sem conexão com o Garimppu. Tentando de novo..." };
  }
}

/** Free plan: tells Garimppu once a day that this e-mail is still using the extension. */
async function pingLead() {
  const { account, leadPingAt } = await chrome.storage.local.get(["account", "leadPingAt"]);
  if (!account?.email || account.subscriber || Date.now() - (leadPingAt || 0) < LEAD_PING_MS) return;
  const result = await call("/api/extension/lead", { method: "POST", body: { email: account.email }, auth: false });
  if (result.ok) await chrome.storage.local.set({ leadPingAt: Date.now() });
}

function safeName(text) {
  return (text || "anuncio").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "anuncio";
}

async function download(items) {
  for (const item of items) {
    await chrome.downloads.download({ url: item.url, filename: `Garimppu/${safeName(item.name)}.${item.ext}`, conflictAction: "uniquify" });
  }
}

const HANDLERS = {
  ads: (m) => call("/api/extension/ads", { method: "POST", body: { url: m.url, nodes: m.nodes, run_id: m.runId } }),
  youtube: (m) => call("/api/extension/youtube", { method: "POST", body: { term: m.term, country: m.country, ids: m.ids, run_id: m.runId } }),
  tiktok: (m) => call("/api/extension/tiktok", { method: "POST", body: { country: m.country, industry: m.industry, keyword: m.keyword, materials: m.materials, run_id: m.runId } }),
  tiktokDetails: (m) => call("/api/extension/tiktok/details", { method: "POST", body: { details: m.details } }),
  favorite: (m) => call("/api/extension/favorite", { method: "POST", body: { url: m.url, node: m.node } }),
  me: () => call("/api/extension/me"),
  lead: (m) => call("/api/extension/lead", { method: "POST", body: { email: m.email }, auth: false }),
  login: (m) => call("/api/extension/login", { method: "POST", body: { email: m.email, password: m.password }, auth: false }),
  download: async (m) => {
    try {
      await download(m.items);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Não foi possível baixar: ${error.message}` };
    }
  },
  ping: async () => {
    await pingLead();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  handler(message).then(reply);
  return true;
});
