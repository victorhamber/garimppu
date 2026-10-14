// On the TikTok Creative Center Top Ads page: collects the ads the page loads and sends them to Garimppu.
(() => {
  const B = GARIMPPU_BAR;
  const LIST = "garimppu:tt";
  const DETAIL = "garimppu:ttd";
  const BATCH = 100;
  const FLUSH_MS = 1500;

  let account = null;
  let mining = false;
  let favorited = new Set();
  let pageKey = null;
  let country = "BR";
  let industry = null;
  let keyword = null;
  let keywordReady = true;
  let ads = new Map();
  let queued = new Set();
  let queue = [];
  let notas = {};
  let asked = new Set();
  let detailQueue = [];
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
  let idleTicks = 0;
  let scrollNote = "";
  let openedAt = 0;
  let autoScroll = false;

  function readPage() {
    const params = new URLSearchParams(location.search);
    const region = ((params.get("region") || "BR").toUpperCase().match(/[A-Z]{2}/) || ["BR"])[0];
    const niche = params.get("industry") || "";
    const hash = new URLSearchParams(location.hash.replace(/^#/, "")).get("garimppu-busca");
    const word = (hash || "").replace(/\s+/g, " ").trim().slice(0, 100);
    return {
      country: region,
      industry: niche || null,
      keyword: word || null,
      auto: params.get("garimppu") === "1",
      key: `${region}\n${niche}\n${word}`,
    };
  }

  function reset(next) {
    pageKey = next.key;
    autoScroll = next.auto;
    country = next.country;
    industry = next.industry;
    keyword = next.keyword;
    keywordReady = !keyword;
    ads = new Map();
    queued = new Set();
    queue = [];
    notas = {};
    asked = new Set();
    detailQueue = [];
    runId = searchId = total = null;
    sent = fresh = 0;
    note = "";
    paused = null;
    lastCount = 0;
    idleTicks = 0;
    openedAt = Date.now();
    if (keyword && mining) {
      const word = keyword;
      const poke = () => {
        if (!keywordReady && keyword === word) window.postMessage({ garimppu: "tiktok-type", keyword: word }, location.origin);
      };
      poke();
      const timer = setInterval(poke, 700);
      setTimeout(() => clearInterval(timer), 15000);
    }
  }

  function requestHasKeyword(url, word) {
    try {
      const value = new URL(url, location.origin).searchParams.get("keyword") || "";
      return value.toLowerCase().includes(word.toLowerCase());
    } catch {
      return false;
    }
  }

  function materialsOf(value, into) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => materialsOf(item, into));
      return;
    }
    if (Array.isArray(value.materials)) {
      for (const item of value.materials) {
        if (item && item.id != null && (item.video_info || item.ad_title || item.brand_name)) into.push(item);
      }
    }
    for (const item of Object.values(value)) materialsOf(item, into);
  }

  function takeList(text, url) {
    if (!keywordReady) {
      if (requestHasKeyword(url, keyword)) keywordReady = true;
      else if (Date.now() - openedAt < 20000) return;
      else {
        keywordReady = true;
        note = "A busca por palavra não aplicou; coletando o que a página mostra.";
      }
      if (keywordReady && mining && autoScroll && bar) bar.setScrolling(true, scrollTick);
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const found = [];
    materialsOf(payload, found);
    let added = 0;
    for (const item of found) {
      const id = String(item.id);
      if (ads.has(id)) continue;
      ads.set(id, item);
      added += 1;
    }
    if (!added || !mining) return;
    enqueue();
    paintNotas();
    paintTools();
    render();
  }

  function numberOrNull(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  function takeDetail(text, id) {
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const body = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
    if (!body || (body.comment == null && body.share == null && !body.landing_page)) return;
    const adId = String(id || body.id || body.material_id || "");
    if (!adId) return;
    const ad = ads.get(adId);
    if (ad) {
      if (body.comment != null) ad.comment = numberOrNull(body.comment);
      if (body.share != null) ad.share = numberOrNull(body.share);
    }
    detailQueue.push({
      id: adId,
      comment: numberOrNull(body.comment),
      share: numberOrNull(body.share),
      landing_page: body.landing_page || null,
    });
    if (detailQueue.length >= 20) flushDetails();
    else setTimeout(flushDetails, 1000);
  }

  function enqueue() {
    if (!mining || !account?.subscriber || paused) return;
    for (const [id, item] of ads) {
      if (queued.has(id)) continue;
      queued.add(id);
      queue.push(item);
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
    if (!mining || sending || paused || !queue.length || !account?.subscriber) return;
    sending = true;
    const key = pageKey;
    const batch = queue.slice(0, BATCH);
    render();
    const result = await B.message({
      type: "tiktok", country, industry, keyword, materials: batch, runId,
    });
    sending = false;
    if (key !== pageKey) return;
    if (result.ok) {
      queue = queue.slice(batch.length);
      runId = result.data.run_id;
      searchId = result.data.search_id;
      sent += result.data.received;
      fresh += result.data.new;
      total = result.data.total;
      Object.assign(notas, result.data.notas || {});
      for (const [id, info] of Object.entries(result.data.stats || {})) {
        const ad = ads.get(id);
        if (!ad || !info) continue;
        if (info.likes != null) ad.like = info.likes;
        if (info.comments != null) ad.comment = info.comments;
        if (info.shares != null) ad.share = info.shares;
        if (info.ctr != null) ad.ctr = info.ctr;
      }
      if (!note.startsWith("A busca")) note = "";
      paintNotas();
      paintTools();
      askDetails(result.data.need_detail || []);
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

  function askDetails(ids) {
    for (const id of ids) {
      if (asked.has(id)) continue;
      asked.add(id);
      window.postMessage({ garimppu: "tiktok-detail", id }, location.origin);
    }
  }

  let detailTimer = null;
  function flushDetails() {
    if (detailTimer || !detailQueue.length || !account?.subscriber) return;
    detailTimer = setTimeout(async () => {
      detailTimer = null;
      const batch = detailQueue.splice(0, 50);
      const result = await B.message({ type: "tiktokDetails", details: batch });
      if (result.ok) {
        Object.assign(notas, result.data || {});
        paintNotas();
        paintTools();
      } else {
        detailQueue.unshift(...batch);
      }
      if (detailQueue.length) flushDetails();
    }, 600);
  }

  function paintNotas() {
    if (!mining) return;
    for (const [id, nota] of Object.entries(notas)) {
      const link = document.querySelector(`a[href*="${id}"]`);
      if (!link || link.querySelector(".garimppu-nota")) continue;
      const tier = B.tier(nota);
      const badge = document.createElement("span");
      badge.className = "garimppu-nota";
      badge.textContent = `${tier.score} ${tier.label}`;
      badge.title = "Pontuação de 0 a 100";
      badge.style.cssText = `display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;
        background:${tier.color};color:${tier.ink};font:600 11px/1.4 ui-monospace,monospace;
        ${tier.color === "transparent" ? "border:1px solid #2a2e33;" : ""}`;
      link.appendChild(badge);
    }
  }

  function compactCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(number);
  }

  function paintTools() {
    if (!mining) return;
    for (const [id, item] of ads) {
      const link = document.querySelector(`a[href*="${id}"]`);
      const parent = link?.parentElement;
      if (!parent) continue;
      let host = parent.querySelector(`:scope > .garimppu-tools[data-id="${id}"]`);
      if (!host) {
        host = document.createElement("div");
        host.className = "garimppu-tools";
        host.dataset.id = id;
        host.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;font:600 12px system-ui,sans-serif;";
        link.insertAdjacentElement("afterend", host);
      }
      const bits = [];
      if (item.like != null) bits.push(`${compactCount(item.like)} curtidas`);
      if (item.comment != null) bits.push(`${compactCount(item.comment)} comentários`);
      if (item.share != null) bits.push(`${compactCount(item.share)} compartilhamentos`);
      const ctr = Number(item.ctr);
      if (Number.isFinite(ctr) && ctr > 0 && ctr <= 1) bits.push(`top ${Math.max(1, Math.round(ctr * 100))}% em cliques`);
      const saved = favorited.has(id);
      host.innerHTML = `<button type="button" data-act="download" style="height:26px;padding:0 10px;border:1px solid #2a2e33;border-radius:6px;background:#15171a;color:#e8e6e1;cursor:pointer;">Baixar</button>
        <button type="button" data-act="favorite" style="height:26px;padding:0 10px;border:1px solid ${saved ? "#5cc98b" : "#2a2e33"};border-radius:6px;background:#15171a;color:${saved ? "#5cc98b" : "#e8e6e1"};cursor:pointer;" ${saved ? "disabled" : ""}>${saved ? "Nos favoritos" : "Favoritar"}</button>
        <span style="color:#8d9096;">${bits.join(" · ")}</span>`;
      host.querySelector('[data-act="download"]').onclick = () => {
        const cover = item.video_info?.cover;
        if (!cover) return;
        B.message({ type: "download", items: [{ url: cover, name: id, ext: "jpg" }] });
      };
      host.querySelector('[data-act="favorite"]').onclick = () => saveAd(id, host);
    }
  }

  async function saveAd(id, host) {
    const button = host.querySelector('[data-act="favorite"]');
    if (!account?.subscriber) {
      if (button) button.textContent = "Assine para favoritar";
      return;
    }
    if (button) button.textContent = "Salvando...";
    const result = await B.message({ type: "save", kind: "tiktok", ref: id });
    if (result.ok) favorited.add(id);
    else if (button) button.textContent = result.status === 404 ? "Envie antes" : "Falhou";
    if (result.ok) paintTools();
  }

  function scrollTick() {
    const root = scrollTarget();
    const before = ads.size;
    const room = root.scrollHeight - root.scrollTop - root.clientHeight;
    if (ads.size > lastCount) {
      lastCount = ads.size;
      idleTicks = 0;
    } else if (room < 80) idleTicks += 1;
    if (idleTicks >= 8) {
      scrollNote = "O TikTok não trouxe mais anúncios.";
      bar?.setScrolling(false);
      render();
      return;
    }
    if (room < 80 && idleTicks % 4 === 3) root.scrollBy(0, -700);
    else root.scrollBy(0, Math.round(root.clientHeight * 0.85));
    if (ads.size === before) lastCount = ads.size;
  }

  function scrollTarget() {
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight > window.innerHeight + 200) return doc;
    let best = doc;
    let height = 0;
    for (const el of document.querySelectorAll("main, [class*='content'], [class*='list']")) {
      if (el.scrollHeight > el.clientHeight + 200 && el.scrollHeight > height) {
        best = el;
        height = el.scrollHeight;
      }
    }
    return best;
  }

  const style = document.createElement("style");
  style.textContent = `html[data-garimppu-tt="open"] body { margin-right: ${B.WIDTH}px !important; }
    html[data-garimppu-mining="off"] .garimppu-tools, html[data-garimppu-mining="off"] .garimppu-nota { display: none !important; }`;
  document.documentElement.appendChild(style);
  let bar = null;

  function ensureBar() {
    if (bar) return;
    bar = B.open("garimppu-tt", "garimppuTt");
    bar.tick = scrollTick;
    bar.onStop = () => setMining(false);
  }

  function render() {
    if (!bar) return;
    const links = [];
    if (searchId) links.push(`<a href="${B.APP}/tiktok?search_id=${searchId}" target="_blank" rel="noopener">Ver no Garimppu</a>`);
    let status = "";
    let error = false;
    if (!account) status = "Informe seu e-mail no ícone do Garimppu para enviar os anúncios.";
    else if (!account.subscriber) {
      status = "Grátis: entre com a senha para enviar os anúncios.";
      links.push(`<a href="${B.escapeHtml(account.upgrade_url || B.APP)}" target="_blank" rel="noopener">Assinar o Garimppu</a>`);
    } else if (paused || note) {
      status = paused || note;
      error = Boolean(paused);
    } else if (!keywordReady) status = `Buscando "${keyword}" no TikTok...`;
    else if (sending || queue.length) status = `Enviando... ${queue.length} na fila. Deixe esta aba aberta.`;
    else if (total !== null) status = `Esta busca tem ${total} anúncios no Garimppu.`;
    else status = keyword ? `Coletando anúncios de "${keyword}".` : "Os anúncios desta página vão para o app.";
    bar.paint({
      seen: `<b>${ads.size}</b> ${ads.size === 1 ? "anúncio visto" : "anúncios vistos"}`,
      sent: account?.subscriber ? `<b>${sent}</b> enviados ao app · <b>${fresh}</b> novos` : "",
      status,
      error,
      links: links.join(""),
      count: ads.size,
      scrollNote,
    });
  }

  function setMining(on) {
    const next = Boolean(on);
    if (next !== mining) {
      mining = next;
      chrome.storage.local.set({ miningOn: mining });
    }
    document.documentElement.dataset.garimppuMining = mining ? "on" : "off";
    if (!mining) {
      bar?.setScrolling(false);
      queue = [];
      bar?.hide();
      B.latch(() => setMining(true));
      return;
    }
    B.hideLatch();
    ensureBar();
    bar.show();
    if (keyword && !keywordReady) {
      const word = keyword;
      window.postMessage({ garimppu: "tiktok-type", keyword: word }, location.origin);
    }
    enqueue();
    paintNotas();
    paintTools();
    render();
    if (autoScroll && keywordReady) bar.setScrolling(true, scrollTick);
    if (queue.length) schedule(0);
  }

  async function loadAccount() {
    const stored = await chrome.storage.local.get(["account", "miningOn"]);
    account = stored.account || null;
    mining = Boolean(stored.miningOn);
    paused = null;
    const page = readPage();
    if (page.auto && !mining) {
      mining = true;
      chrome.storage.local.set({ miningOn: true });
    }
    reset(page);
    setMining(mining);
  }

  loadAccount();
  B.message({ type: "ping" });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (typeof data[LIST] === "string") takeList(data[LIST], data.url || "");
    if (typeof data[DETAIL] === "string") takeDetail(data[DETAIL], data.id);
    if (data["garimppu:typed"]) render();
  });

  window.addEventListener("beforeunload", (event) => {
    if (mining && (queue.length || detailQueue.length) && !paused && account?.subscriber) event.preventDefault();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.account) loadAccount();
    else if (changes.miningOn && Boolean(changes.miningOn.newValue) !== mining) setMining(Boolean(changes.miningOn.newValue));
  });

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "where") reply({ page: "tiktok", results: true, mining });
    else if (message?.type === "mine") {
      setMining(message.on !== false);
      reply({ ok: true, mining });
    }
  });
})();
