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
    ? "Assinante: os anúncios que passam no filtro e os favoritos vão para o app."
    : "Plano grátis: filtros e downloads.";
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

async function place() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  mineTab = tab || null;
  if (!tab?.id) return;
  let here = null;
  try {
    here = await chrome.tabs.sendMessage(tab.id, { type: "where" });
  } catch {}
  if (here?.page !== "youtube") return;
  go.dataset.youtube = "1";
  go.removeAttribute("target");
  if (here.results) {
    note.textContent = `Busca “${here.term}”. Os filtros e a rolagem ficam na barra da página.`;
    go.textContent = "Minerar esta busca";
  } else {
    note.textContent = "Pesquise um termo no YouTube. A barra abre na página de resultados.";
    go.textContent = "Ativar na próxima busca";
  }
}

go.addEventListener("click", async (event) => {
  if (go.dataset.youtube !== "1" || !mineTab?.id) return;
  event.preventDefault();
  let result = null;
  try {
    result = await chrome.tabs.sendMessage(mineTab.id, { type: "mine" });
  } catch {
    note.textContent = "Recarregue a página do YouTube e clique de novo.";
    return;
  }
  if (result?.armed) {
    note.textContent = "Ativado. Pesquise um termo no YouTube.";
    go.textContent = "Ativado";
    return;
  }
  window.close();
});

document.getElementById("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("account");
  showAccount(null);
});

start();
