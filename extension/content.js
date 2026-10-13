// Collects the ads the Ad Library loads while the user scrolls and sends them to Garimppu in small batches.
(() => {
  const TAG = "garimppu:ads";
  const APP = "https://app.garimppu.com";
  const BATCH = 40;
  const FLUSH_MS = 1500;
  const SEARCH_PARAMS = ["q", "view_all_page_id", "country", "media_type", "search_type", "content_languages[0]"];

  let searchKey = currentSearchKey();
  let seen = new Set();
  let queue = [];
  let runId = null;
  let searchId = null;
  let sent = 0;
  let fresh = 0;
  let total = null;
  let sending = false;
  let paused = null; // error that waits for the user (missing or revoked key)
  let note = "";
  let timer = null;

  function currentSearchKey() {
    const params = new URLSearchParams(location.search);
    if (!params.get("q") && !params.get("view_all_page_id")) return null;
    return SEARCH_PARAMS.map((name) => `${name}=${params.get(name) || ""}`).join("&");
  }

  function* parseLenient(text) {
    const body = text.startsWith("for (;;);") ? text.slice(9) : text;
    try {
      yield JSON.parse(body);
      return;
    } catch {}
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        yield JSON.parse(trimmed);
      } catch {}
    }
  }

  function* adNodes(payload) {
    const stack = [payload];
    while (stack.length) {
      const item = stack.pop();
      if (Array.isArray(item)) {
        stack.push(...item);
      } else if (item && typeof item === "object") {
        if ("ad_archive_id" in item && item.snapshot && typeof item.snapshot === "object") {
          yield item;
          continue;
        }
        stack.push(...Object.values(item));
      }
    }
  }

  function take(text) {
    checkSearch();
    if (!searchKey) return;
    let added = 0;
    for (const payload of parseLenient(text)) {
      for (const node of adNodes(payload)) {
        const id = String(node.ad_archive_id);
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(node);
        added += 1;
      }
    }
    if (added) schedule();
    render();
  }

  function checkSearch() {
    const key = currentSearchKey();
    if (key === searchKey) return;
    searchKey = key;
    seen = new Set();
    queue = [];
    runId = searchId = total = null;
    sent = fresh = 0;
    note = "";
    render();
  }

  function schedule(delay = FLUSH_MS) {
    if (timer || paused) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, queue.length >= BATCH ? 0 : delay);
  }

  async function flush() {
    if (sending || paused || !queue.length || !searchKey) return;
    sending = true;
    const key = searchKey;
    const batch = queue.slice(0, BATCH);
    render();
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: "ads", url: location.href, nodes: batch, runId });
    } catch {
      result = { ok: false, status: 0, error: "A extensão foi atualizada. Recarregue a página." };
    }
    sending = false;
    if (key !== searchKey) return;
    if (result?.ok) {
      queue = queue.slice(batch.length);
      runId = result.data.run_id;
      searchId = result.data.search_id;
      sent += result.data.received;
      fresh += result.data.new;
      total = result.data.total;
      note = "";
    } else if (result?.status === 401) {
      paused = result.error;
    } else if (result?.status === 422) {
      queue = queue.slice(batch.length);
      note = result.error;
    } else {
      note = result?.error || "Não foi possível enviar. Tentando de novo...";
      render();
      setTimeout(() => schedule(0), 5000);
      return;
    }
    render();
    if (queue.length) schedule(0);
  }

  // --- On-page counter -------------------------------------------------------------------------------------

  let root = null;
  let hidden = false;

  function mount() {
    if (root || !document.body) return;
    const host = document.createElement("div");
    host.id = "garimppu-counter";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .box { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; width: 280px; box-sizing: border-box;
          padding: 12px 14px; border: 1px solid #2a2e33; border-radius: 10px; background: #15171a; color: #e8e6e1;
          font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 12px 32px rgb(0 0 0 / .45); }
        .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .logo { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; background: #f2a93b;
          color: #1a1206; font: 700 12px ui-monospace, monospace; }
        .close { margin-left: auto; border: 0; background: none; color: #8d9096; font-size: 18px; line-height: 1;
          cursor: pointer; padding: 2px 4px; border-radius: 4px; }
        .close:hover { color: #e8e6e1; }
        .close:focus-visible, a:focus-visible { outline: 2px solid #f2a93b; outline-offset: 2px; }
        .count { margin-top: 8px; font-variant-numeric: tabular-nums; }
        .count b { font: 600 15px ui-monospace, monospace; }
        .status { margin-top: 4px; color: #8d9096; font-size: 12px; }
        .status.error { color: #f06363; }
        a { display: inline-block; margin-top: 8px; color: #f2a93b; font-size: 12px; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
      <div class="box" role="status" aria-live="polite">
        <div class="head"><span class="logo" aria-hidden="true">G</span>Garimppu
          <button class="close" type="button" aria-label="Esconder o contador do Garimppu">×</button></div>
        <div class="count"></div>
        <div class="status"></div>
        <a target="_blank" rel="noopener" hidden>Ver no Garimppu</a>
      </div>`;
    shadow.querySelector(".close").addEventListener("click", () => {
      hidden = true;
      host.remove();
    });
    document.body.appendChild(host);
    root = shadow;
    render();
  }

  function render() {
    if (hidden) return;
    if (!root) {
      mount();
      return;
    }
    const count = root.querySelector(".count");
    const status = root.querySelector(".status");
    const link = root.querySelector("a");
    status.classList.toggle("error", Boolean(paused || note));
    if (!searchKey) {
      count.textContent = "";
      status.textContent = "Faça uma busca por palavra-chave ou página para começar.";
      link.hidden = true;
      return;
    }
    const waiting = queue.length;
    count.innerHTML = `<b>${sent}</b> anúncios enviados · <b>${fresh}</b> novos`;
    if (paused) status.textContent = paused;
    else if (note) status.textContent = note;
    else if (sending || waiting) status.textContent = `Enviando... ${waiting} na fila. Deixe esta aba aberta.`;
    else if (total !== null) status.textContent = `Esta busca tem ${total} anúncios no Garimppu. Role para trazer mais.`;
    else status.textContent = "Role a página para capturar os anúncios.";
    link.hidden = !searchId;
    if (searchId) link.href = `${APP}/criativos?search_id=${searchId}`;
  }

  // --- Wiring ----------------------------------------------------------------------------------------------

  window.addEventListener("message", (event) => {
    if (event.source !== window || typeof event.data?.[TAG] !== "string") return;
    take(event.data[TAG]);
  });

  function scanInitialHtml() {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (script.textContent.includes("ad_archive_id")) take(script.textContent);
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scanInitialHtml, { once: true });
  else scanInitialHtml();

  setInterval(checkSearch, 1000);

  window.addEventListener("beforeunload", (event) => {
    if (queue.length && !paused) event.preventDefault();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.token) return;
    paused = null;
    note = "";
    render();
    schedule(0);
  });
})();
