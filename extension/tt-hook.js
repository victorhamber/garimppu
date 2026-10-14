// Runs in the Creative Center page: copies the Top Ads responses and can type the keyword the app asked for.
(() => {
  const LIST = "garimppu:tt";
  const DETAIL = "garimppu:ttd";
  const API = "/creative_radar_api/v1/top_ads/v2/detail";

  function emit(url, text) {
    if (typeof text !== "string") return;
    const tag = text.includes("materials") ? LIST : text.includes("landing_page") || text.includes('"comment"') ? DETAIL : null;
    if (tag) window.postMessage({ [tag]: text, url: String(url || "") }, location.origin);
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (typeof url === "string" && url.includes("creative_radar_api")) response.clone().text().then((text) => emit(url, text), () => {});
    } catch {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes("creative_radar_api")) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") emit(String(url), this.responseText);
        } catch {}
      });
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  function typeKeyword(keyword) {
    const input = [...document.querySelectorAll("input")].find((el) =>
      /palavra|keyword|buscar|search|pesquis/i.test(`${el.placeholder} ${el.getAttribute("aria-label") || ""}`));
    if (!input) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    set.call(input, keyword);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: keyword, inputType: "insertText" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    window.postMessage({ "garimppu:typed": keyword }, location.origin);
    return true;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.garimppu === "tiktok-type") {
      const keyword = String(event.data.keyword || "");
      if (typeKeyword(keyword)) return;
      const timer = setInterval(() => {
        if (typeKeyword(keyword)) clearInterval(timer);
      }, 500);
      setTimeout(() => clearInterval(timer), 15000);
    }
    if (event.data?.garimppu === "tiktok-detail") {
      const id = String(event.data.id || "");
      if (!id) return;
      originalFetch(`${API}?material_id=${encodeURIComponent(id)}&period=180`, { credentials: "include" })
        .then((response) => response.text())
        .then((text) => window.postMessage({ [DETAIL]: text, url: "", id }, location.origin))
        .catch(() => {});
    }
  });
})();
