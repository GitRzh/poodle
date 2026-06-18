// ═══════════════════════════════════════════════════════
// POODLE — background.js
// ═══════════════════════════════════════════════════════

const LOCAL  = "http://localhost:8000";
const REMOTE = "https://rzhface-poodle.hf.space";

async function fetchBackend(endpoint, body) {
  for (const base of [LOCAL, REMOTE]) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body)
      });
      if (res.ok) return { result: await res.json() };
    } catch (_) {}
  }
  return { error: "Backend unreachable — local and remote both failed." };
}

// ── Context menu setup ────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "poodle-simplify",  title: "Simplify This",        contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-translate", title: "Translate and Explain", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-factcheck", title: "Fact Check",            contexts: ["selection"] });
  });
});

// ── Context menu click ────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const typeMap = {
    "poodle-simplify":  "SIMPLIFY_SELECTION",
    "poodle-translate": "TRANSLATE_SELECTION",
    "poodle-factcheck": "FACTCHECK_SELECTION"
  };
  const type = typeMap[info.menuItemId];
  if (!type) return;
  chrome.storage.sync.get(["simplifyLevel", "translateLang", "theme"], (s) => {
    chrome.tabs.sendMessage(tab.id, {
      type,
      text:  info.selectionText,
      level: s.simplifyLevel || "simple",
      lang:  s.translateLang  || "English",
      dark:  s.theme === "dark"
    });
  });
});

// ── Backend proxy ─────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "BACKEND_REQUEST") return false;

  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

  // Read user's API key from storage, inject into request body
  chrome.storage.sync.get(["userApiKey"], async (s) => {
    const body = { ...message.body, api_key: s.userApiKey || "" };
    try {
      const response = await fetchBackend(message.endpoint, body);
      clearInterval(keepAlive);
      sendResponse(response);
    } catch (e) {
      clearInterval(keepAlive);
      sendResponse({ error: e.message });
    }
  });

  return true;
});