const connectForm = document.getElementById("connect");
const connected = document.getElementById("connected");
const error = document.getElementById("error");
const submit = connectForm.querySelector("button");
function showAccount(account) {
  connectForm.hidden = Boolean(account);
  connected.hidden = !account;
  if (!account) {
    document.getElementById("email").focus();
    return;
  }
  document.getElementById("who").textContent = account.email;
  document.getElementById("plan").textContent = account.subscriber
    ? "Assinante: o que você filtrar vai para o app."
    : "Grátis: filtrar e baixar.";
  const upgrade = document.getElementById("upgrade");
  upgrade.hidden = account.subscriber;
  upgrade.href = account.upgrade_url || "https://app.garimppu.com";
}

async function start() {
  const { account } = await chrome.storage.local.get("account");
  showAccount(account || null);
  place();
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
  place();
});

const go = document.getElementById("go");
const note = document.getElementById("note");
let mineTab = null;

function armButton(mining) {
  go.dataset.mine = "1";
  go.dataset.on = mining ? "1" : "0";
  go.removeAttribute("href");
  go.removeAttribute("target");
  go.textContent = mining ? "Desativar mineração" : "Ativar mineração";
}

async function place() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  mineTab = tab || null;
  delete go.dataset.mine;
  go.href = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all";
  go.target = "_blank";
  go.textContent = "Abrir a Biblioteca de Anúncios";
  note.textContent = "Abra o YouTube, o TikTok ou a Biblioteca de Anúncios.";
  if (!tab?.id) return;
  let here = null;
  try {
    here = await chrome.tabs.sendMessage(tab.id, { type: "where" });
  } catch {}
  if (!here?.page) {
    const url = tab.url || "";
    if (/youtube\.com|facebook\.com\/ads\/library|ads\.tiktok\.com/.test(url)) {
      note.textContent = "Recarregue a página e clique de novo.";
    }
    return;
  }
  armButton(Boolean(here.mining));
  if (here.mining) note.textContent = "Mineração ligada nesta aba.";
  else if (here.page === "youtube" && here.results) note.textContent = `Busca “${here.term}”.`;
  else if (here.page === "youtube") note.textContent = "Pesquise um termo nesta aba.";
  else if (here.page === "facebook") note.textContent = "Biblioteca de Anúncios aberta.";
  else note.textContent = "TikTok aberto nesta aba.";
}

go.addEventListener("click", async (event) => {
  if (go.dataset.mine !== "1" || !mineTab?.id) return;
  event.preventDefault();
  const turnOn = go.dataset.on !== "1";
  try {
    await chrome.tabs.sendMessage(mineTab.id, { type: "mine", on: turnOn });
  } catch {
    note.textContent = "Recarregue a página e clique de novo.";
    return;
  }
  window.close();
});

document.getElementById("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("account");
  showAccount(null);
});

start();
