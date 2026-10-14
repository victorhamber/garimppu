// Sidebar shared by the YouTube and TikTok collectors: account, auto-scroll and the send status.
const GARIMPPU_BAR = {
  APP: "https://app.garimppu.com",
  WIDTH: 300,
  SPEEDS: { slow: 2600, normal: 1400, fast: 700 },

  escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  },

  tier(nota) {
    const score = Math.round(Number(nota) || 0);
    if (score >= 65) return { score, label: "forte", color: "#ff6b3d", ink: "#1a1206" };
    if (score >= 50) return { score, label: "boa", color: "#f2a93b", ink: "#1a1206" };
    if (score >= 35) return { score, label: "média", color: "#1d2024", ink: "#e8e6e1" };
    return { score, label: "baixa", color: "transparent", ink: "#8d9096" };
  },

  async message(payload) {
    try {
      return (await chrome.runtime.sendMessage(payload)) || { ok: false, status: 0, error: "Sem resposta da extensão." };
    } catch {
      return { ok: false, status: 0, error: "A extensão foi atualizada. Recarregue a página." };
    }
  },

  /** Fixed right-hand bar. `attr` is the html dataset flag that insets the page. */
  open(id, attr) {
    const host = document.createElement("div");
    host.id = id;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${PANEL_CSS}</style>
      <aside class="panel" aria-label="Garimppu">
        <div class="head"><span class="logo" aria-hidden="true">G</span>Garimppu
          <button class="stop" type="button" data-act="stop">Desativar</button>
          <button class="icon collapse" type="button" aria-label="Recolher a barra do Garimppu" title="Recolher">›</button></div>
        <div class="body">
          <div class="stats" role="status" aria-live="polite">
            <div class="line seen"></div><div class="line sent"></div><div class="status"></div><div class="links"></div>
          </div>
          <div class="extra"></div>
          <section>
            <h2>Rolar a página</h2>
            <button class="primary" type="button" data-act="scroll">Rolar a página</button>
            <div class="seg" role="group" aria-label="Velocidade da rolagem">
              <button type="button" data-speed="slow">Lenta</button>
              <button type="button" data-speed="normal">Normal</button>
              <button type="button" data-speed="fast">Rápida</button>
            </div>
            <p class="hint scroll-note"></p>
          </section>
        </div>
      </aside>
      <button class="tab" type="button" aria-label="Abrir a barra do Garimppu" hidden>
        <span class="logo" aria-hidden="true">G</span><span class="tab-count"></span>
      </button>`;
    shadow.addEventListener("keydown", (event) => event.stopPropagation());
    document.documentElement.appendChild(host);

    const bar = {
      shadow,
      speed: "normal",
      collapsed: false,
      scrolling: false,
      timer: null,
      tick: null,
      onSpeed: null,
    };
    const apply = () => {
      document.documentElement.dataset[attr] = bar.collapsed ? "closed" : "open";
      shadow.querySelector(".panel").hidden = bar.collapsed;
      shadow.querySelector(".tab").hidden = !bar.collapsed;
    };
    shadow.querySelector('[data-act="stop"]').addEventListener("click", () => bar.onStop?.());
    shadow.querySelector(".collapse").addEventListener("click", () => {
      bar.collapsed = true;
      apply();
    });
    shadow.querySelector(".tab").addEventListener("click", () => {
      bar.collapsed = false;
      apply();
    });
    shadow.querySelector('[data-act="scroll"]').addEventListener("click", () => bar.setScrolling(!bar.scrolling));
    for (const button of shadow.querySelectorAll("[data-speed]")) {
      button.addEventListener("click", () => {
        bar.speed = button.dataset.speed;
        bar.onSpeed?.(bar.speed);
        if (bar.scrolling) bar.setScrolling(true);
        else bar.paint();
      });
    }
    bar.show = () => {
      bar.collapsed = false;
      apply();
    };
    bar.hide = () => {
      clearInterval(bar.timer);
      bar.timer = null;
      bar.scrolling = false;
      document.documentElement.dataset[attr] = "closed";
      shadow.querySelector(".panel").hidden = true;
      shadow.querySelector(".tab").hidden = true;
    };
    bar.setScrolling = (on, tick) => {
      if (tick) bar.tick = tick;
      clearInterval(bar.timer);
      bar.timer = null;
      bar.scrolling = Boolean(on);
      if (bar.scrolling && bar.tick) {
        bar.timer = setInterval(bar.tick, GARIMPPU_BAR.SPEEDS[bar.speed] || GARIMPPU_BAR.SPEEDS.normal);
        bar.tick();
      }
      bar.paint();
    };
    bar.paint = (state = bar.state || {}) => {
      bar.state = state;
      apply();
      const seen = shadow.querySelector(".seen");
      seen.innerHTML = state.seen || "";
      shadow.querySelector(".sent").innerHTML = state.sent || "";
      const status = shadow.querySelector(".status");
      status.textContent = state.status || "";
      status.classList.toggle("error", Boolean(state.error));
      shadow.querySelector(".links").innerHTML = state.links || "";
      shadow.querySelector(".tab-count").textContent = state.count ? String(state.count) : "";
      const scrollButton = shadow.querySelector('[data-act="scroll"]');
      scrollButton.textContent = bar.scrolling ? "Parar" : "Rolar a página";
      scrollButton.classList.toggle("on", bar.scrolling);
      for (const button of shadow.querySelectorAll("[data-speed]")) {
        button.setAttribute("aria-pressed", String(button.dataset.speed === bar.speed));
      }
      shadow.querySelector(".scroll-note").textContent = bar.scrolling
        ? "A página continua rolando."
        : (state.scrollNote || "");
    };
    bar.paint();
    return bar;
  },

  /** Small edge button while mining is off, so the page stays clear until the person turns it on. */
  latch(turnOn) {
    let button = document.getElementById("garimppu-wake");
    if (!button) {
      button = document.createElement("button");
      button.id = "garimppu-wake";
      button.type = "button";
      button.textContent = "Ativar mineração";
      button.style.cssText = `position:fixed;top:50%;right:0;z-index:2147483646;transform:translateY(-50%);
        padding:10px 8px;border:1px solid #2a2e33;border-right:0;border-radius:8px 0 0 8px;background:#0c0d0f;
        color:#f2a93b;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:-6px 0 20px rgb(0 0 0 / .35);`;
      document.documentElement.appendChild(button);
    }
    button.onclick = turnOn;
    button.hidden = false;
  },

  hideLatch() {
    const button = document.getElementById("garimppu-wake");
    if (button) button.hidden = true;
  },
};

const PANEL_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483647; width: 300px; display: flex;
    flex-direction: column; border-left: 1px solid #2a2e33; background: #0c0d0f; color: #e8e6e1;
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: -12px 0 32px rgb(0 0 0 / .35); }
  .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #2a2e33; font-weight: 600; font-size: 14px; }
  .logo { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; background: #f2a93b;
    color: #1a1206; font: 700 12px ui-monospace, monospace; }
  .collapse { margin-left: auto; }
    .body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .stats { padding: 8px; border: 1px solid #2a2e33; border-radius: 8px; background: #15171a; }
  .line { font-variant-numeric: tabular-nums; }
  .line + .line { margin-top: 4px; }
  .line b { font: 600 14px ui-monospace, monospace; }
  .line:empty, .status:empty, .links:empty, .hint:empty { display: none; }
  .status { margin-top: 6px; color: #8d9096; font-size: 12px; }
  .status.error { color: #f06363; }
  .links { display: flex; gap: 12px; margin-top: 8px; }
  a { color: #f2a93b; font-size: 12px; text-decoration: none; }
  a:hover { text-decoration: underline; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h2, summary { margin: 0; color: #8d9096; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .stop { height: 26px; margin-left: auto; padding: 0 8px; border: 1px solid #2a2e33; border-radius: 6px; background: transparent;
    color: #e8e6e1; font-size: 12px; }
  .stop:hover { border-color: #f2a93b; color: #f2a93b; }
  .collapse { margin-left: 0; }
  button { font: 600 13px system-ui, sans-serif; cursor: pointer; }
  .primary { height: 34px; border: 0; border-radius: 6px; background: #f2a93b; color: #1a1206; }
  .primary:hover { filter: brightness(1.08); }
  .primary.on { background: #1d2024; color: #f2a93b; box-shadow: inset 0 0 0 1px #f2a93b; }
  .icon { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none;
    color: #8d9096; font-size: 18px; line-height: 1; }
  .icon:hover { background: #1d2024; color: #e8e6e1; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); padding: 2px; border: 1px solid #2a2e33; border-radius: 6px; background: #15171a; }
  .seg button { height: 26px; border: 0; border-radius: 4px; background: none; color: #8d9096; font-size: 12px; }
  .seg button[aria-pressed="true"] { background: #1d2024; color: #e8e6e1; }
  .extra { display: flex; flex-direction: column; gap: 8px; }
  .extra:empty { display: none; }
  .extra section, .extra details { display: flex; flex-direction: column; gap: 6px; }
  .extra h2, .extra summary { margin: 0; color: #8d9096; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { height: 24px; padding: 0 8px; border: 1px solid #2a2e33; border-radius: 999px; background: #15171a; color: #e8e6e1; font-size: 11px; }
  .chips button:hover { border-color: #f2a93b; color: #f2a93b; }
  .extra .row { display: grid; grid-template-columns: 1fr 76px; align-items: center; gap: 8px; }
  .extra label { font-size: 12px; }
  .extra input[type="number"], .extra select { width: 100%; height: 30px; padding: 0 8px; border: 1px solid #2a2e33;
    border-radius: 6px; background: #15171a; color: #e8e6e1; font: 13px system-ui, sans-serif; }
  .extra input[type="number"] { font-family: ui-monospace, monospace; text-align: right; }
  .extra .check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .extra .check input { margin: 0; accent-color: #f2a93b; }
  .hint { margin: 0; color: #8d9096; font-size: 12px; }
  .tab { position: fixed; top: 50%; right: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center;
    gap: 6px; padding: 10px 6px; transform: translateY(-50%); border: 1px solid #2a2e33; border-right: 0;
    border-radius: 8px 0 0 8px; background: #0c0d0f; color: #e8e6e1; font: 600 12px ui-monospace, monospace;
    box-shadow: -6px 0 20px rgb(0 0 0 / .35); }
  .tab:hover { color: #f2a93b; }
  [hidden] { display: none !important; }
  button:focus-visible, a:focus-visible { outline: 2px solid #f2a93b; outline-offset: 2px; }`;
