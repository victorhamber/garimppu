// Runs in the page itself: copies the Ad Library's own GraphQL answers to content.js. Never changes a request.
(() => {
  const TAG = "garimppu:ads";
  const isGraphql = (url) => typeof url === "string" && url.includes("/graphql");
  const emit = (text) => {
    if (typeof text === "string" && text.includes("ad_archive_id")) window.postMessage({ [TAG]: text }, location.origin);
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (isGraphql(url)) response.clone().text().then(emit, () => {});
    } catch {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isGraphql(String(url))) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") emit(this.responseText);
        } catch {}
      });
    }
    return originalOpen.call(this, method, url, ...rest);
  };
})();
