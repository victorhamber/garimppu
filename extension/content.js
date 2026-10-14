// On the Ad Library: judges every ad against the user's filters, adds Baixar/Favoritar to each card and, for
// subscribers, sends the ads that pass to Garimppu in small batches.
(() => {
  const F = GARIMPPU_FILTERS;
  const TAG = "garimppu:ads";
  const APP = "https://app.garimppu.com";
  const BATCH = 40;
  const FLUSH_MS = 1500;
  const SEARCH_PARAMS = ["q", "view_all_page_id", "country", "media_type", "search_type", "content_languages[0]"];
  const ID_LABEL = /(?:Identificação da biblioteca|ID da biblioteca|Library ID)\s*:\s*(\d{6,})/g;
  const ID_XPATH = "//body//*[not(self::script) and not(self::style)][text()[contains(., 'biblioteca:') or contains(., 'Library ID:')]]";

  let account = null; // { email, subscriber, token, upgrade_url }
  let filters = { ...F.defaults };
  let searchKey = currentSearchKey();
  let nodes = new Map(); // ad id -> raw ad as the Library sent it
  let pageAds = new Map(); // advertiser page id -> ads seen in this search
  let queued = new Set();
  let queue = [];
  let favorited = new Set();
  let runId = null;
  let searchId = null;
  let sent = 0;
  let fresh = 0;
  let total = null;
  let sending = false;
  let paused = null;
  let note = "";
  let timer = null;
  const cards = new Map(); // ad id -> { card, root }

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

  const pageCount = (node) => pageAds.get(String(node.page_id || "")) || 0;
  const failures = (node) => F.failures(node, filters, pageCount(node));

  function take(text) {
    checkSearch();
    if (!searchKey) return;
    let added = 0;
    for (const payload of parseLenient(text)) {
      for (const node of adNodes(payload)) {
        const id = String(node.ad_archive_id);
        if (nodes.has(id)) continue;
        nodes.set(id, node);
        const page = String(node.page_id || "");
        pageAds.set(page, (pageAds.get(page) || 0) + 1);
        added += 1;
      }
    }
    if (!added) return;
    enqueuePassing();
    refreshCards();
    render();
  }

  function checkSearch() {
    const key = currentSearchKey();
    if (key === searchKey) return;
    searchKey = key;
    nodes = new Map();
    pageAds = new Map();
    queued = new Set();
    queue = [];
    runId = searchId = total = null;
    sent = fresh = 0;
    note = "";
    render();
  }

  // --- Sending (subscribers) -------------------------------------------------------------------------------

  function enqueuePassing() {
    if (!account?.subscriber || !searchKey) return;
    for (const [id, node] of nodes) {
      if (queued.has(id) || failures(node).length) continue;
      queued.add(id);
      queue.push(node);
    }
    if (queue.length) schedule();
  }

  function schedule(delay = FLUSH_MS) {
    if (timer || paused) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, queue.length >= BATCH ? 0 : delay);
  }

  async function flush() {
    if (sending || paused || !queue.length || !searchKey || !account?.subscriber) return;
    sending = true;
    const key = searchKey;
    const batch = queue.slice(0, BATCH);
    render();
    const result = await message({ type: "ads", url: location.href, nodes: batch, runId });
    sending = false;
    if (key !== searchKey) return;
    if (result.ok) {
      queue = queue.slice(batch.length);
      runId = result.data.run_id;
      searchId = result.data.search_id;
      sent += result.data.received;
      fresh += result.data.new;
      total = result.data.total;
      note = "";
    } else if (result.status === 401 || result.status === 403) {
      paused = result.error;
    } else if (result.status === 422) {
      queue = queue.slice(batch.length);
      note = result.error;
    } else {
      note = result.error || "Não foi possível enviar. Tentando de novo...";
      render();
      setTimeout(() => schedule(0), 5000);
      return;
    }
    render();
    if (queue.length) schedule(0);
  }

  async function message(payload) {
    try {
      return (await chrome.runtime.sendMessage(payload)) || { ok: false, status: 0, error: "Sem resposta da extensão." };
    } catch {
      return { ok: false, status: 0, error: "A extensão foi atualizada. Recarregue a página." };
    }
  }

  // --- Per-card tools --------------------------------------------------------------------------------------

  function mediaOf(node) {
    const snapshot = node.snapshot || {};
    const items = [];
    const add = (url, ext) => {
      if (url && !items.some((item) => item.url === url)) items.push({ url, ext });
    };
    for (const video of [...(snapshot.videos || []), ...(snapshot.cards || [])]) add(video.video_hd_url || video.video_sd_url, "mp4");
    if (!items.length) {
      for (const image of [...(snapshot.images || []), ...(snapshot.cards || [])]) {
        add(image.original_image_url || image.resized_image_url, "jpg");
      }
    }
    const base = `${node.page_name || snapshot.page_name || "anuncio"}-${node.ad_archive_id}`;
    return items.map((item, i) => ({ ...item, name: items.length > 1 ? `${base}-${i + 1}` : base }));
  }

  const CARD_CSS = `
    :host { all: initial; display: block; margin: 8px 0; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    button, a.btn { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border: 1px solid #2a2e33;
      border-radius: 6px; background: #15171a; color: #e8e6e1; font: 600 12px system-ui, sans-serif; cursor: pointer; text-decoration: none; }
    button:hover:not(:disabled) { border-color: #f2a93b; color: #f2a93b; }
    button:disabled { opacity: .55; cursor: default; }
    button.saved { border-color: #5cc98b; color: #5cc98b; opacity: 1; }
    button:focus-visible, a:focus-visible { outline: 2px solid #f2a93b; outline-offset: 2px; }
    .logo { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: #f2a93b; color: #1a1206;
      font: 700 11px ui-monospace, monospace; }
    .why { flex-basis: 100%; color: #8d9096; }
    .why.error { color: #f06363; }
    .why a { color: #f2a93b; }
    svg { width: 14px; height: 14px; }`;

  const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>';
  const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/></svg>';

  function findCard(label) {
    let node = label;
    while (node.parentElement && node.parentElement !== document.body) {
      const ids = node.parentElement.textContent.match(ID_LABEL);
      if (ids && ids.length > 1) break;
      node = node.parentElement;
    }
    return node;
  }

  function scanCards() {
    if (!account || !searchKey) return;
    const found = document.evaluate(ID_XPATH, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < found.snapshotLength; i += 1) {
      const label = found.snapshotItem(i);
      if (label.closest("[data-garimppu-card]")) continue;
      ID_LABEL.lastIndex = 0;
      const match = ID_LABEL.exec(label.textContent);
      if (!match) continue;
      const id = match[1];
      const card = findCard(label);
      card.dataset.garimppuCard = id;
      const host = document.createElement("div");
      host.className = "garimppu-tools";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CARD_CSS}</style><div class="bar"><span class="logo" aria-hidden="true">G</span>
        <button type="button" data-act="download">${DOWNLOAD_ICON}Baixar</button>
        <button type="button" data-act="favorite">${STAR_ICON}Favoritar</button><span class="why" hidden></span></div>`;
      root.querySelector('[data-act="download"]').addEventListener("click", () => downloadAd(id));
      root.querySelector('[data-act="favorite"]').addEventListener("click", () => favoriteAd(id));
      label.insertAdjacentElement("afterend", host);
      cards.set(id, { card, root });
    }
    refreshCards();
  }

  function refreshCards() {
    const filtering = F.active(filters);
    for (const [id, { card, root }] of cards) {
      if (!card.isConnected) {
        cards.delete(id);
        continue;
      }
      const node = nodes.get(id);
      const reasons = node ? failures(node) : [];
      card.dataset.garimppuDim = String(Boolean(filtering && filters.dim && reasons.length));
      const download = root.querySelector('[data-act="download"]');
      const media = node ? mediaOf(node) : [];
      download.disabled = !media.length;
      download.title = node ? (media.length ? `Baixar ${media.length > 1 ? `${media.length} arquivos` : media[0].ext === "mp4" ? "o vídeo" : "a imagem"}` : "Este anúncio não tem mídia") : "Role um pouco para carregar este anúncio";
      const star = root.querySelector('[data-act="favorite"]');
      const saved = favorited.has(id);
      star.classList.toggle("saved", saved);
      star.disabled = saved || !node;
      star.lastChild.textContent = saved ? "Nos favoritos" : "Favoritar";
      const why = root.querySelector(".why");
      if (!why.dataset.locked) {
        why.hidden = !(filtering && reasons.length);
        why.className = "why";
        why.textContent = reasons.length ? `Fora do filtro: ${reasons.join(", ")}` : "";
      }
    }
  }

  function say(id, html, error = false) {
    const entry = cards.get(id);
    if (!entry) return;
    const why = entry.root.querySelector(".why");
    why.innerHTML = html;
    why.className = error ? "why error" : "why";
    why.hidden = false;
    why.dataset.locked = "1";
    setTimeout(() => {
      delete why.dataset.locked;
      refreshCards();
    }, 6000);
  }

  async function downloadAd(id) {
    const node = nodes.get(id);
    if (!node) return;
    const result = await message({ type: "download", items: mediaOf(node) });
    if (!result.ok) say(id, escapeHtml(result.error), true);
  }

  async function favoriteAd(id) {
    const node = nodes.get(id);
    if (!node) return;
    if (!account?.subscriber) {
      say(id, `Favoritos vão para a sua conta no Garimppu. <a href="${escapeHtml(account?.upgrade_url || APP)}" target="_blank" rel="noopener">Assine para liberar</a>`);
      return;
    }
    const star = cards.get(id)?.root.querySelector('[data-act="favorite"]');
    if (star) {
      star.disabled = true;
      star.lastChild.textContent = "Salvando...";
    }
    const result = await message({ type: "favorite", url: location.href, node });
    if (result.ok) {
      favorited.add(id);
      say(id, `Salvo nos <a href="${APP}/colecoes/${result.data.collection_id}" target="_blank" rel="noopener">Favoritos</a>.`);
    } else {
      say(id, escapeHtml(result.error), true);
    }
    refreshCards();
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // --- On-page counter -------------------------------------------------------------------------------------

  let counter = null;
  let hidden = false;

  function mount() {
    if (counter || !document.body) return;
    const style = document.createElement("style");
    style.textContent = `[data-garimppu-dim="true"] { opacity: .3; transition: opacity .15s; }
      [data-garimppu-dim="true"]:hover, [data-garimppu-dim="true"]:focus-within { opacity: 1; }`;
    document.head.appendChild(style);
    const host = document.createElement("div");
    host.id = "garimppu-counter";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .box { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; width: 290px; box-sizing: border-box;
          padding: 12px 14px; border: 1px solid #2a2e33; border-radius: 10px; background: #15171a; color: #e8e6e1;
          font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 12px 32px rgb(0 0 0 / .45); }
        .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .logo { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; background: #f2a93b;
          color: #1a1206; font: 700 12px ui-monospace, monospace; }
        .close { margin-left: auto; border: 0; background: none; color: #8d9096; font-size: 18px; line-height: 1;
          cursor: pointer; padding: 2px 4px; border-radius: 4px; }
        .close:hover { color: #e8e6e1; }
        .close:focus-visible, a:focus-visible { outline: 2px solid #f2a93b; outline-offset: 2px; }
        .line { margin-top: 6px; font-variant-numeric: tabular-nums; }
        .line b { font: 600 14px ui-monospace, monospace; }
        .line:empty { display: none; }
        .status { margin-top: 4px; color: #8d9096; font-size: 12px; }
        .status.error { color: #f06363; }
        .status:empty { display: none; }
        a { color: #f2a93b; font-size: 12px; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .links { display: flex; gap: 12px; margin-top: 8px; }
        .links:empty { display: none; }
      </style>
      <div class="box" role="status" aria-live="polite">
        <div class="head"><span class="logo" aria-hidden="true">G</span>Garimppu
          <button class="close" type="button" aria-label="Esconder o contador do Garimppu">×</button></div>
        <div class="line seen"></div>
        <div class="line sent"></div>
        <div class="status"></div>
        <div class="links"></div>
      </div>`;
    shadow.querySelector(".close").addEventListener("click", () => {
      hidden = true;
      host.remove();
    });
    document.body.appendChild(host);
    counter = shadow;
    render();
  }

  function render() {
    if (hidden) return;
    if (!counter) {
      mount();
      return;
    }
    const seen = counter.querySelector(".seen");
    const sentLine = counter.querySelector(".sent");
    const status = counter.querySelector(".status");
    const links = counter.querySelector(".links");
    status.classList.toggle("error", Boolean(paused || note));
    sentLine.textContent = "";
    links.innerHTML = "";

    if (!account) {
      seen.textContent = "";
      status.textContent = "Clique no ícone do Garimppu e informe seu e-mail para liberar os filtros e os downloads.";
      return;
    }
    if (!searchKey) {
      seen.textContent = "";
      status.textContent = "Faça uma busca por palavra-chave ou página para começar.";
      return;
    }
    const passing = [...nodes.values()].filter((node) => !failures(node).length).length;
    seen.innerHTML = F.active(filters)
      ? `<b>${passing}</b> de <b>${nodes.size}</b> anúncios passam no filtro`
      : `<b>${nodes.size}</b> anúncios vistos · sem filtro`;

    if (!account.subscriber) {
      status.textContent = "Plano grátis: filtros e downloads.";
      links.innerHTML = `<a href="${escapeHtml(account.upgrade_url || APP)}" target="_blank" rel="noopener">Assine para enviar ao Garimppu</a>`;
      return;
    }
    sentLine.innerHTML = `<b>${sent}</b> enviados ao app · <b>${fresh}</b> novos`;
    const waiting = queue.length;
    if (paused) status.textContent = paused;
    else if (note) status.textContent = note;
    else if (sending || waiting) status.textContent = `Enviando... ${waiting} na fila. Deixe esta aba aberta.`;
    else if (total !== null) status.textContent = `Esta busca tem ${total} anúncios no Garimppu. Role para trazer mais.`;
    else status.textContent = "Role a página: os anúncios que passam no filtro vão para o app.";
    if (searchId) links.innerHTML = `<a href="${APP}/criativos?search_id=${searchId}" target="_blank" rel="noopener">Ver no Garimppu</a>`;
  }

  // --- Wiring ----------------------------------------------------------------------------------------------

  async function loadSettings() {
    const stored = await chrome.storage.local.get("account");
    account = stored.account || null;
    filters = await F.load();
    paused = null;
    enqueuePassing();
    scanCards();
    render();
    if (queue.length) schedule(0);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || typeof event.data?.[TAG] !== "string") return;
    take(event.data[TAG]);
  });

  function start() {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (script.textContent.includes("ad_archive_id")) take(script.textContent);
    }
    let pending = null;
    new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        scanCards();
      }, 400);
    }).observe(document.body, { childList: true, subtree: true });
    loadSettings();
    message({ type: "ping" });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  setInterval(checkSearch, 1000);

  window.addEventListener("beforeunload", (event) => {
    if (queue.length && !paused && account?.subscriber) event.preventDefault();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.account || changes.filters) loadSettings();
  });
})();
