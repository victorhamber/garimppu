const connected = document.getElementById("connected");
const form = document.getElementById("connect");
const input = document.getElementById("token");
const error = document.getElementById("error");
const submit = form.querySelector("button");

function show(email) {
  connected.hidden = !email;
  form.hidden = Boolean(email);
  if (email) document.getElementById("email").textContent = email;
  else input.focus();
}

async function check() {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return show(null);
  const result = await chrome.runtime.sendMessage({ type: "me" });
  if (result.ok) return show(result.data.email);
  show(null);
  error.textContent = result.error;
  error.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = input.value.trim();
  if (!token) return;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = "Conectando...";
  await chrome.storage.local.set({ token });
  const result = await chrome.runtime.sendMessage({ type: "me" });
  submit.disabled = false;
  submit.textContent = "Conectar";
  if (result.ok) {
    input.value = "";
    show(result.data.email);
    return;
  }
  if (result.status === 401) await chrome.storage.local.remove("token");
  error.textContent = result.error;
  error.hidden = false;
});

document.getElementById("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("token");
  show(null);
});

check();
