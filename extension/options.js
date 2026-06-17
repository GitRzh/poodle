const themeToggle = document.getElementById("theme-toggle");
const themeIcon   = document.getElementById("theme-icon");
const apiKeyInput = document.getElementById("api-key");
const saveBtn     = document.getElementById("save-btn");
const clearBtn    = document.getElementById("clear-btn");
const statusEl    = document.getElementById("status");
const keyStatusEl = document.getElementById("key-status");

function updateKeyStatus(key) {
  if (!keyStatusEl) return;
  if (key) {
    keyStatusEl.textContent = `✓ Using your key (ends in ...${key.slice(-4)})`;
    keyStatusEl.style.color = "#1a7a1a";
  } else {
    keyStatusEl.textContent = "Using default key — works out of the box.";
    keyStatusEl.style.color = "#888";
  }
}

chrome.storage.sync.get(["userApiKey", "theme"], (s) => {
  if (s.userApiKey) apiKeyInput.value = s.userApiKey;
  updateKeyStatus(s.userApiKey || "");
  const dark = s.theme === "dark";
  document.body.classList.toggle("dark", dark);
  themeIcon.innerHTML = dark ? "&#9728;" : "&#9789;";
});

themeToggle.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  themeIcon.innerHTML = dark ? "&#9728;" : "&#9789;";
  chrome.storage.sync.set({ theme: dark ? "dark" : "light" });
});

saveBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) { statusEl.textContent = "Enter a key first."; return; }
  if (!key.startsWith("gsk_")) {
    statusEl.textContent = "Groq keys start with gsk_ — check yours.";
    statusEl.style.color = "#b33";
    return;
  }
  chrome.storage.sync.set({ userApiKey: key }, () => {
    statusEl.textContent = "Saved!";
    statusEl.style.color = "#1a7a1a";
    updateKeyStatus(key);
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  });
});

clearBtn.addEventListener("click", () => {
  chrome.storage.sync.remove("userApiKey", () => {
    apiKeyInput.value = "";
    statusEl.textContent = "Cleared — using default key.";
    statusEl.style.color = "#888";
    updateKeyStatus("");
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  });
});