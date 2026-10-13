const DEFAULT_API = "https://api.garimppu.com";
const NO_KEY = "Conecte a extensão: clique no ícone do Garimppu e cole sua chave.";

async function call(path, { method = "GET", body } = {}) {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  if (!token) return { ok: false, status: 401, error: NO_KEY };
  try {
    const response = await fetch((apiBase || DEFAULT_API) + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === "ads") {
    call("/api/extension/ads", { method: "POST", body: { url: message.url, nodes: message.nodes, run_id: message.runId } })
      .then(reply);
    return true;
  }
  if (message?.type === "me") {
    call("/api/extension/me").then(reply);
    return true;
  }
  return false;
});
