// On any YouTube tab: when a search is open, the bar collects, filters and can scroll. A normal visit works,
// not only a search opened from the app (YouTube changes pages without reloading).
(() => {
  const B = GARIMPPU_BAR;
  const TAG = "garimppu:yt";
  const BATCH = 50;
  const FLUSH_MS = 1500;
  const ID_RE = /(?:[?&]v=|\/shorts\/)([\w-]{11})(?!\w)/;
  const CARD_SELECTOR = "ytd-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model";
  const FILTER_DEFAULTS = { minNota: 0, minViews: 0, maxDays: 0, hideShorts: false, dim: true, sort: "youtube" };

  let account = null;
  let yt = { ...FILTER_DEFAULTS };
  let search = null;
  let epoch = 0;
  let ids = new Set();
  let cards = new Map();
  let meta = new Map();
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
  let bar = null;
  let observer = null;
  let presentTimer = null;

  function readSearch() {
    if (!location.pathname.startsWith("/results")) return null;
    const params = new URLSearchParams(location.search);
    const term = (params.get("search_query") || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!term) return null;
    const country = ((params.get("gl") || "BR").toUpperCase().match(/[A-Z]{2}/) || ["BR"])[0];
    return { term, country, key: `${country}\n${term}`, auto: params.get("garimppu") === "1" };
  }

  function parseViews(text) {
    const match = text.match(/(\d+(?:[.,]\d+)*)\s*(mil|mi|milhões|milhão|bi|bilhões|bilhão)?\s*(?:de\s+)?visualiza/i);
    if (!match) return null;
    const suffix = (match[2] || "").toLowerCase();
    const raw = match[1];
    const decimal = suffix && raw.includes(".") && !raw.includes(",") && raw.split(".").pop().length !== 3;
    const value = decimal ? Number(raw) : Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value)) return null;
    const mult = suffix.startsWith("bi") ? 1e9 : suffix === "mi" || suffix.startsWith("milh") ? 1e6 : suffix === "mil" ? 1e3 : 1;
    return Math.round(value * mult);
  }

  function viewsIn(text) {
    return parseViews(text) ?? parseViews(`${(text.match(/(?:^|\n)\s*(\d+(?:[.,]\d+)*)\s*(mil|mi|milhões|milhão)\s*(?=\n|$)/i) || [])[0] || ""} visualizações`);
  }

  function parseAgeDays(text) {
    const match = text.match(/há\s+(\d+)\s+(minuto|hora|dia|semana|m[eê]s|ano)/i);
    if (!match) return null;
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("minuto") || unit.startsWith("hora")) return 0;
    if (unit.startsWith("dia")) return n;
    if (unit.startsWith("semana")) return n * 7;
    if (unit.startsWith("m")) return n * 30;
    if (unit.startsWith("ano")) return n * 365;
    return null;
  }

  function watchLink(root) {
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < 60) {
      const node = stack.pop();
      seen += 1;
      for (const link of node.querySelectorAll?.("a[href]") || []) {
        if (ID_RE.test(link.href)) return link;
      }
      for (const el of node.querySelectorAll?.("*") || []) {
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return null;
  }

  function readMeta(id, card) {
    const prev = meta.get(id);
    if (prev && prev.views != null && prev.days != null) return prev;
    const labels = [card.innerText || ""];
    for (const el of card.querySelectorAll("[aria-label]")) labels.push(el.getAttribute("aria-label"));
    const text = labels.join("\n");
    const next = {
      views: viewsIn(text),
      days: parseAgeDays(text),
      shorts: card.localName === "ytd-reel-item-renderer" || /\/shorts\//.test(card.querySelector("a[href]")?.href || ""),
    };
    const merged = {
      views: next.views ?? prev?.views ?? null,
      days: next.days ?? prev?.days ?? null,
      shorts: next.shorts || Boolean(prev?.shorts),
    };
    meta.set(id, merged);
    return merged;
  }

  function fails(id) {
    const info = meta.get(id);
    const reasons = [];
    if (yt.hideShorts && info?.shorts) reasons.push("short");
    if (yt.minViews && info?.views != null && info.views < yt.minViews) reasons.push("views");
    if (yt.maxDays && info?.days != null && info.days > yt.maxDays) reasons.push("antigo");
    if (yt.minNota && notas[id] != null && notas[id] < yt.minNota) reasons.push("nota");
    return reasons;
  }

  const blocksSend = (id) => fails(id).some((reason) => reason !== "nota");
  const filtering = () => Boolean(yt.minNota || yt.minViews || yt.maxDays || yt.hideShorts);

  function reset(next) {
    search = next;
    ids = new Set();
    cards = new Map();
    meta = new Map();
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
    scrollNote = "";
  }

  function ensureBar() {
    if (bar) return;
    const style = document.createElement("style");
    style.textContent = `html[data-garimppu-yt="open"] ytd-app { margin-right: ${B.WIDTH}px !important; }
      html[data-garimppu-yt="open"] ytd-masthead { width: calc(100% - ${B.WIDTH}px) !important; }
      [data-garimppu-yt-list] { display: flex !important; flex-direction: column !important; align-items: stretch !important; }
      [data-garimppu-dim="true"] { opacity: .3; transition: opacity .15s; }
      [data-garimppu-dim="true"]:hover { opacity: 1; }`;
    document.documentElement.appendChild(style);
    bar = B.open("garimppu-yt", "garimppuYt");
    bar.tick = scrollTick;
    bar.shadow.querySelector(".extra").innerHTML = `
      <section>
        <h2><label for="yt-sort">Ordenar</label></h2>
        <select id="yt-sort">
          <option value="youtube">Como o YouTube mostra</option>
          <option value="nota">Maior pontuação</option>
          <option value="views">Mais visualizações</option>
          <option value="recent">Mais recentes</option>
        </select>
      </section>
      <section>
        <h2>Filtros</h2>
        <div class="row"><label for="minNota">Pontuação mínima</label>
          <input id="minNota" type="number" min="0" max="100" inputmode="numeric" placeholder="0"></div>
        <div class="row"><label for="minViews">Visualizações, no mínimo</label>
          <input id="minViews" type="number" min="0" max="1000000000" inputmode="numeric" placeholder="0"></div>
        <div class="row"><label for="maxDays">Publicado nos últimos dias</label>
          <input id="maxDays" type="number" min="0" max="3650" inputmode="numeric" placeholder="0"></div>
        <label class="check"><input id="hideShorts" type="checkbox"> Esconder vídeos curtos</label>
        <label class="check"><input id="dim" type="checkbox"> Esconder os que ficam de fora</label>
      </section>`;
    bar.shadow.querySelector(".extra").addEventListener("input", saveFilters);
    bar.shadow.querySelector(".extra").addEventListener("change", saveFilters);
    fillFilters(true);
  }

  function fillFilters(all = false) {
    if (!bar) return;
    const typing = bar.shadow.activeElement;
    const set = (id, apply) => {
      const el = bar.shadow.getElementById(id);
      if (all || el !== typing) apply(el);
    };
    set("minNota", (el) => (el.value = yt.minNota || ""));
    set("minViews", (el) => (el.value = yt.minViews || ""));
    set("maxDays", (el) => (el.value = yt.maxDays || ""));
    set("hideShorts", (el) => (el.checked = Boolean(yt.hideShorts)));
    set("dim", (el) => (el.checked = yt.dim !== false));
    set("yt-sort", (el) => (el.value = yt.sort || "youtube"));
  }

  function saveFilters() {
    const num = (id) => Math.max(0, Number.parseInt(bar.shadow.getElementById(id).value, 10) || 0);
    yt = {
      minNota: Math.min(100, num("minNota")),
      minViews: num("minViews"),
      maxDays: num("maxDays"),
      hideShorts: bar.shadow.getElementById("hideShorts").checked,
      dim: bar.shadow.getElementById("dim").checked,
      sort: bar.shadow.getElementById("yt-sort").value || "youtube",
    };
    chrome.storage.local.set({ ytFilters: yt });
    enqueue();
    applyPresentation();
    render();
  }

  function hideBar() {
    document.documentElement.dataset.garimppuYt = "closed";
    document.documentElement.dataset.garimppuYtSort = "off";
    if (!bar) return;
    bar.shadow.querySelector(".panel").hidden = true;
    bar.shadow.querySelector(".tab").hidden = true;
  }

  function checkSearch() {
    const next = readSearch();
    if ((next?.key || null) === (search?.key || null)) return;
    const switched = Boolean(search);
    epoch += 1;
    const mine = epoch;
    bar?.setScrolling(false);
    if (!next) {
      reset(null);
      stopWatch();
      hideBar();
      return;
    }
    reset(next);
    ensureBar();
    bar.show();
    watchResults();
    setTimeout(() => {
      if (mine !== epoch) return;
      harvest();
      maybeAutoScroll(next);
      render();
    }, switched ? 1200 : 0);
    render();
  }

  async function maybeAutoScroll(next) {
    const { ytArmed } = await chrome.storage.local.get("ytArmed");
    if (!search || search.key !== next.key) return;
    if (!next.auto && !ytArmed) return;
    bar.show();
    bar.setScrolling(true, scrollTick);
    if (ytArmed) chrome.storage.local.remove("ytArmed");
  }

  function harvest() {
    if (!search) return;
    const scoped = document.querySelector("ytd-search");
    const root = scoped?.querySelector(CARD_SELECTOR) ? scoped : document.body;
    if (!root) return;
    let added = 0;
    let reads = 0;
    for (const card of root.querySelectorAll(CARD_SELECTOR)) {
      const match = watchLink(card)?.href.match(ID_RE);
      if (!match) continue;
      const id = match[1];
      const known = cards.get(id);
      if (!known || !known.isConnected) {
        cards.set(id, card);
        if (!ids.has(id)) {
          ids.add(id);
          added += 1;
        }
      }
      const info = meta.get(id);
      if (reads < 25 && (!info || info.views == null || info.days == null)) {
        readMeta(id, cards.get(id));
        reads += 1;
      }
    }
    if (added) enqueue();
    schedulePresent();
    if (added) render();
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

  function schedulePresent() {
    if (presentTimer) return;
    presentTimer = setTimeout(() => {
      presentTimer = null;
      applyPresentation();
    }, 400);
  }

  function applyPresentation() {
    if (!search) return;
    const dimOn = filtering() && yt.dim !== false;
    const parents = new Set();
    const ranked = [];
    for (const [id, card] of cards) {
      if (!card.isConnected) {
        cards.delete(id);
        continue;
      }
      const reasons = fails(id);
      const dim = dimOn && reasons.length ? "true" : "false";
      if (card.dataset.garimppuDim !== dim) card.dataset.garimppuDim = dim;
      if (card.localName === "ytd-video-renderer" || card.localName === "yt-lockup-view-model") {
        ranked.push({ id, card });
        if (card.parentElement) parents.add(card.parentElement);
      }
    }
    const sorting = yt.sort && yt.sort !== "youtube";
    for (const parent of parents) {
      if (sorting) parent.dataset.garimppuYtList = "";
      else delete parent.dataset.garimppuYtList;
    }
    if (!sorting) {
      for (const item of ranked) if (item.card.style.order) item.card.style.removeProperty("order");
      return;
    }
    const value = (id) => {
      const info = meta.get(id);
      if (yt.sort === "views") return info?.views ?? -1;
      if (yt.sort === "recent") return info?.days == null ? -1e9 : -info.days;
      return notas[id] ?? -1;
    };
    ranked.sort((a, b) => (fails(a.id).length > 0) - (fails(b.id).length > 0) || value(b.id) - value(a.id));
    ranked.forEach((item, index) => {
      const order = String(index + 1);
      if (item.card.style.order !== order) item.card.style.order = order;
    });
  }

  function enqueue() {
    if (!account?.subscriber || !search || paused) return;
    for (const id of ids) {
      if (queued.has(id) || blocksSend(id)) continue;
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
    if (sending || paused || !search || !account?.subscriber) return;
    const batch = [];
    while (queue.length && batch.length < BATCH) {
      const id = queue.shift();
      if (blocksSend(id)) {
        queued.delete(id);
        continue;
      }
      batch.push(id);
    }
    if (!batch.length) return;
    sending = true;
    const key = search.key;
    const mine = epoch;
    render();
    const result = await B.message({ type: "youtube", term: search.term, country: search.country, ids: batch, runId });
    sending = false;
    if (mine !== epoch || key !== search?.key) return;
    if (result.ok) {
      runId = result.data.run_id;
      searchId = result.data.search_id;
      sent += result.data.received;
      fresh += result.data.new;
      total = result.data.total;
      Object.assign(notas, result.data.notas || {});
      note = "";
      paintNotas();
      schedulePresent();
    } else if (result.status === 401 || result.status === 403) {
      paused = result.error;
    } else if (result.status === 422) {
      note = result.error;
    } else {
      queue.unshift(...batch);
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
      const card = cards.get(id);
      const thumb = card?.querySelector("ytd-thumbnail, #thumbnail");
      if (!thumb || thumb.querySelector(".garimppu-nota")) continue;
      const tier = B.tier(nota);
      const badge = document.createElement("span");
      badge.className = "garimppu-nota";
      badge.textContent = `${tier.score} ${tier.label}`;
      badge.title = "Pontuação de 0 a 100";
      badge.style.cssText = `position:absolute;z-index:3;top:8px;left:8px;padding:2px 6px;border-radius:4px;
        background:${tier.color};color:${tier.ink};font:600 11px/1.4 ui-monospace,monospace;
        ${tier.color === "transparent" ? "border:1px solid #2a2e33;" : ""}`;
      if (getComputedStyle(thumb).position === "static") thumb.style.position = "relative";
      thumb.appendChild(badge);
    }
  }

  function atBottom() {
    const root = document.scrollingElement || document.documentElement;
    return window.innerHeight + window.scrollY >= root.scrollHeight - 80;
  }

  function scrollTick() {
    if (!search || !bar) {
      bar?.setScrolling(false);
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
    window.scrollBy(0, Math.round(window.innerHeight * 0.85));
  }

  function render() {
    if (!bar || !search) return;
    const links = [];
    if (searchId) links.push(`<a href="${B.APP}/videos?search_id=${searchId}" target="_blank" rel="noopener">Ver no Garimppu</a>`);
    let status = "";
    let error = false;
    let pass = 0;
    for (const id of ids) if (!fails(id).length) pass += 1;
    if (!account) status = "Informe seu e-mail no ícone do Garimppu para enviar os vídeos.";
    else if (!account.subscriber) {
      status = "Grátis: entre com a senha para enviar os vídeos.";
      links.push(`<a href="${B.escapeHtml(account.upgrade_url || B.APP)}" target="_blank" rel="noopener">Assinar o Garimppu</a>`);
    } else if (paused || note) {
      status = paused || note;
      error = true;
    } else if (sending || queue.length) status = `Enviando... ${queue.length} na fila. Deixe esta aba aberta.`;
    else if (total !== null) status = `Esta busca tem ${total} vídeos no Garimppu.`;
    else status = "Os vídeos que entram vão para o app.";
    bar.paint({
      seen: filtering()
        ? `<b>${pass}</b> de <b>${ids.size}</b> entram`
        : `<b>${ids.size}</b> ${ids.size === 1 ? "vídeo visto" : "vídeos vistos"}`,
      sent: account?.subscriber ? `<b>${sent}</b> enviados ao app · <b>${fresh}</b> novos` : "",
      status,
      error,
      links: links.join(""),
      count: ids.size,
      scrollNote,
    });
  }

  async function loadAccount() {
    const stored = await chrome.storage.local.get(["account", "ytFilters"]);
    account = stored.account || null;
    yt = { ...FILTER_DEFAULTS, ...(stored.ytFilters || {}) };
    paused = null;
    fillFilters();
    enqueue();
    applyPresentation();
    render();
    if (queue.length) schedule(0);
  }

  function watchResults() {
    if (observer || !document.body) return;
    let pending = null;
    observer = new MutationObserver((mutations) => {
      if (!search || pending) return;
      const own = mutations.every((mutation) => mutation.target instanceof Element
        && mutation.target.closest("#garimppu-yt, .garimppu-nota"));
      if (own) return;
      pending = setTimeout(() => {
        pending = null;
        harvest();
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopWatch() {
    observer?.disconnect();
    observer = null;
  }

  function startMining() {
    const current = readSearch();
    if (!current) {
      chrome.storage.local.set({ ytArmed: true });
      return { ok: true, armed: true };
    }
    checkSearch();
    ensureBar();
    bar.show();
    bar.setScrolling(true, scrollTick);
    return { ok: true, armed: false };
  }

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "where") {
      const current = readSearch();
      reply({ page: "youtube", results: Boolean(current), term: current?.term || "" });
      return;
    }
    if (message?.type === "mine") reply(startMining());
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !Array.isArray(event.data?.[TAG])) return;
    addIds(event.data[TAG]);
  });
  document.addEventListener("yt-navigate-finish", checkSearch);
  setInterval(checkSearch, 1000);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.account) loadAccount();
    if (changes.ytArmed?.newValue && search) {
      ensureBar();
      bar.show();
      bar.setScrolling(true, scrollTick);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (queue.length && !paused && account?.subscriber) event.preventDefault();
  });

  function start() {
    loadAccount();
    B.message({ type: "ping" });
    checkSearch();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
