// On YouTube search results: collects the video ids on screen and, for subscribers, sends them to Garimppu.
(() => {
  const B = GARIMPPU_BAR;
  const TAG = "garimppu:yt";
  const BATCH = 50;
  const FLUSH_MS = 1500;
  const ID_RE = /(?:[?&]v=|\/shorts\/)([\w-]{11})(?!\w)/;

  let account = null;
  let search = null;
  let epoch = 0;
  let ids = new Set();
  let queued = new Set();
  let queue = [];
  let notas = {};
  let runId = null;
  let searchId = null;
  let sent = 0;
  let fresh = 0;
  let total = null;
  let sending = false;
  let paused = null;
  let note = "";
  let flushTimer = null;
  let lastCount = 0;
  let lastHeight = 0;
  let idleTicks = 0;
  let scrollNote = "";

  function readSearch() {
    if (!location.pathname.startsWith("/results")) return null;
    const params = new URLSearchParams(location.search);
    const term = (params.get("search_query") || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!term) return null;
    const country = ((params.get("gl") || "BR").toUpperCase().match(/[A-Z]{2}/) || ["BR"])[0];
    return { term, country, key: `${country}\n${term}`, auto: params.get("garimppu") === "1" };
  }

  function reset(next) {
    search = next;
    ids = new Set();
    lastHeight = 0;
    queued = new Set();
    queue = [];
    notas = {};
    runId = searchId = total = null;
    sent = fresh = 0;
    note = "";
    paused = null;
    lastCount = 0;
    lastHeight = 0;
    idleTicks = 0;
  }

  function checkSearch() {
    const next = readSearch();
    if ((next?.key || null) === (search?.key || null)) return;
    const switched = Boolean(search);
    epoch += 1;
    const mine = epoch;
    reset(next);
    bar.setScrolling(false);
    scrollNote = "";
    // A new search reuses the same page, so the old results stay up for a moment.
    setTimeout(() => {
      if (mine !== epoch) return;
      harvest();
      render();
    }, switched ? 1200 : 0);
    render();
  }

  function harvest() {
    if (!search) return;
    const root = document.querySelector("ytd-search") || document;
    let added = 0;
    for (const link of root.querySelectorAll("a[href]")) {
      const match = link.href.match(ID_RE);
      if (!match || ids.has(match[1])) continue;
      ids.add(match[1]);
      added += 1;
    }
    if (!added) return;
    enqueue();
    paintNotas();
    render();
  }

  function addIds(list) {
    if (!search || !Array.isArray(list)) return;
    let added = 0;
    for (const id of list) {
      if (typeof id === "string" && /^[\w-]{11}$/.test(id) && !ids.has(id)) {
        ids.add(id);
        added += 1;
      }
    }
    if (!added) return;
    enqueue();
    render();
  }

  function enqueue() {
    if (!account?.subscriber || !search || paused) return;
    for (const id of ids) {
      if (queued.has(id)) continue;
      queued.add(id);
      queue.push(id);
    }
    if (queue.length) schedule();
  }

  function schedule(delay = FLUSH_MS) {
    if (flushTimer || paused) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, queue.length >= BATCH ? 0 : delay);
  }

  async function flush() {
    if (sending || paused || !queue.length || !search || !account?.subscriber) return;
    sending = true;
    const key = search.key;
    const mine = epoch;
    const batch = queue.slice(0, BATCH);
    render();
    const result = await B.message({ type: "youtube", term: search.term, country: search.country, ids: batch, runId });
    sending = false;
    if (mine !== epoch || key !== search?.key) return;
    if (result.ok) {
      queue = queue.slice(batch.length);
      runId = result.data.run_id;
      searchId = result.data.search_id;
      sent += result.data.received;
      fresh += result.data.new;
      total = result.data.total;
      Object.assign(notas, result.data.notas || {});
      note = "";
      paintNotas();
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

  function paintNotas() {
    for (const [id, nota] of Object.entries(notas)) {
      const link = document.querySelector(`ytd-search a[href*="${id}"]`);
      const card = link?.closest("ytd-video-renderer, ytd-reel-item-renderer, ytd-rich-item-renderer");
      const thumb = card?.querySelector("ytd-thumbnail, #thumbnail");
      if (!thumb || thumb.querySelector(".garimppu-nota")) continue;
      const tier = B.tier(nota);
      const badge = document.createElement("span");
      badge.className = "garimppu-nota";
      badge.textContent = `${tier.score} ${tier.label}`;
      badge.title = "Nota do Garimppu";
      badge.style.cssText = `position:absolute;z-index:3;top:8px;left:8px;padding:2px 6px;border-radius:4px;
        background:${tier.color};color:${tier.ink};font:600 11px/1.4 ui-monospace,monospace;
        ${tier.color === "transparent" ? "border:1px solid #2a2e33;" : ""}`;
      thumb.style.position = thumb.style.position || "relative";
      thumb.appendChild(badge);
    }
  }

  function atBottom() {
    const root = document.scrollingElement || document.documentElement;
    return window.innerHeight + window.scrollY >= root.scrollHeight - 80;
  }

  function scrollTick() {
    if (!search) {
      bar.setScrolling(false);
      return;
    }
    const height = (document.scrollingElement || document.documentElement).scrollHeight;
    if (height > lastHeight) {
      lastHeight = height;
      idleTicks = 0;
    }
    if (ids.size > lastCount) {
      lastCount = ids.size;
      idleTicks = 0;
    } else if (atBottom()) idleTicks += 1;
    if (idleTicks >= 8) {
      scrollNote = "O YouTube não trouxe mais vídeos.";
      bar.setScrolling(false);
      render();
      return;
    }
    window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: "smooth" });
  }

  const style = document.createElement("style");
  style.textContent = `html[data-garimppu-yt="open"] ytd-app { margin-right: ${B.WIDTH}px !important; }
    html[data-garimppu-yt="open"] ytd-masthead { width: calc(100% - ${B.WIDTH}px) !important; }`;
  document.documentElement.appendChild(style);
  const bar = B.open("garimppu-yt", "garimppuYt");

  function render() {
    const links = [];
    if (searchId) links.push(`<a href="${B.APP}/videos?search_id=${searchId}" target="_blank" rel="noopener">Ver no Garimppu</a>`);
    let status = "";
    let error = false;
    if (!account) status = "Clique no ícone do Garimppu e entre com sua senha para enviar os vídeos.";
    else if (!account.subscriber) {
      status = "Plano grátis: entre com a senha para enviar os vídeos ao app.";
      links.push(`<a href="${B.escapeHtml(account.upgrade_url || B.APP)}" target="_blank" rel="noopener">Assinar o Garimppu</a>`);
    } else if (!search) status = "Faça uma busca no YouTube para começar.";
    else if (paused || note) {
      status = paused || note;
      error = true;
    } else if (sending || queue.length) status = `Enviando... ${queue.length} na fila. Deixe esta aba aberta.`;
    else if (total !== null) status = `Esta busca tem ${total} vídeos no Garimppu.`;
    else status = "Os vídeos desta busca vão para o app.";
    bar.paint({
      seen: search ? `<b>${ids.size}</b> ${ids.size === 1 ? "vídeo visto" : "vídeos vistos"}` : "",
      sent: account?.subscriber && search ? `<b>${sent}</b> enviados ao app · <b>${fresh}</b> novos` : "",
      status,
      error,
      links: links.join(""),
      count: ids.size,
      scrollNote,
    });
  }

  async function loadAccount() {
    const { account: stored } = await chrome.storage.local.get("account");
    account = stored || null;
    paused = null;
    enqueue();
    render();
    if (queue.length) schedule(0);
  }

  function start() {
    let pending = null;
    new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        harvest();
      }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true });
    loadAccount();
    B.message({ type: "ping" });
    if (search?.auto) bar.setScrolling(true, scrollTick);
  }

  checkSearch();

  window.addEventListener("message", (event) => {
    if (event.source !== window || !Array.isArray(event.data?.[TAG])) return;
    addIds(event.data[TAG]);
  });
  document.addEventListener("yt-navigate-finish", checkSearch);
  setInterval(checkSearch, 1000);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.account) loadAccount();
  });
  window.addEventListener("beforeunload", (event) => {
    if (queue.length && !paused && account?.subscriber) event.preventDefault();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
