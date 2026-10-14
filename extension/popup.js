const connectForm = document.getElementById("connect");
const connected = document.getElementById("connected");
const error = document.getElementById("error");
const submit = connectForm.querySelector("button");
const filtersForm = document.getElementById("filters");
const NUMBERS = ["minDays", "minSameCreative", "minPageAds"];
const CHECKS = ["withLink", "dim"];

function showAccount(account) {
  connectForm.hidden = Boolean(account);
  connected.hidden = !account;
  if (!account) {
    document.getElementById("email").focus();
    return;
  }
  document.getElementById("who").textContent = account.email;
  document.getElementById("plan").textContent = account.subscriber
    ? "Assinante: os anúncios que passam no filtro e os favoritos vão para o app."
    : "Plano grátis: filtros e downloads.";
  const upgrade = document.getElementById("upgrade");
  upgrade.hidden = account.subscriber;
  upgrade.href = account.upgrade_url || "https://app.garimppu.com";
}

async function showFilters() {
  const filters = await GARIMPPU_FILTERS.load();
  for (const name of NUMBERS) document.getElementById(name).value = filters[name] || "";
  for (const name of CHECKS) document.getElementById(name).checked = Boolean(filters[name]);
}

async function start() {
  const { account } = await chrome.storage.local.get("account");
  showAccount(account || null);
  await showFilters();
  if (!account?.subscriber) return;
  const result = await chrome.runtime.sendMessage({ type: "me" });
  if (!result.ok && result.status === 401) {
    const downgraded = { email: account.email, subscriber: false, upgrade_url: account.upgrade_url };
    await chrome.storage.local.set({ account: downgraded });
    showAccount(downgraded);
    document.getElementById("plan").textContent = "Sua sessão de assinante acabou. Saia e entre de novo com a senha.";
  }
}

connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = "Entrando...";
  const result = await chrome.runtime.sendMessage(password ? { type: "login", email, password } : { type: "lead", email });
  submit.disabled = false;
  submit.textContent = "Começar";
  if (!result.ok) {
    error.textContent = result.error;
    error.hidden = false;
    return;
  }
  document.getElementById("password").value = "";
  const account = { email: result.data.email, subscriber: result.data.subscriber, token: result.data.token,
    upgrade_url: result.data.upgrade_url };
  await chrome.storage.local.set({ account, leadPingAt: Date.now() });
  showAccount(account);
});

let savedTimer = null;
filtersForm.addEventListener("input", async () => {
  const filters = {};
  for (const name of NUMBERS) filters[name] = Math.max(0, Number.parseInt(document.getElementById(name).value, 10) || 0);
  for (const name of CHECKS) filters[name] = document.getElementById(name).checked;
  await chrome.storage.local.set({ filters });
  const saved = document.getElementById("saved");
  saved.textContent = "Filtros aplicados na página.";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ""), 2000);
});
filtersForm.addEventListener("submit", (event) => event.preventDefault());

document.getElementById("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("account");
  showAccount(null);
});

start();
