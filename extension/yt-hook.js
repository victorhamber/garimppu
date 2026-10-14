// Runs in the YouTube page: copies video ids out of the search responses. Never changes a request.
(() => {
  const TAG = "garimppu:yt";
  const ID = /^[\w-]{11}$/;

  function idsIn(value, into) {
    if (!value || typeof value !== "object") return;
    if (typeof value.videoId === "string" && ID.test(value.videoId)) into.add(value.videoId);
    for (const item of Object.values(value)) idsIn(item, into);
  }

  function emit(url, text) {
    if (typeof url !== "string" || !url.includes("youtubei/v1/") || typeof text !== "string" || !text.includes("videoId")) return;
    try {
      const ids = new Set();
      idsIn(JSON.parse(text), ids);
      if (ids.size) window.postMessage({ [TAG]: [...ids] }, location.origin);
    } catch {}
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (typeof url === "string" && url.includes("youtubei/v1/")) response.clone().text().then((text) => emit(url, text), () => {});
    } catch {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes("youtubei/v1/")) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") emit(String(url), this.responseText);
        } catch {}
      });
    }
    return originalOpen.call(this, method, url, ...rest);
  };
})();
