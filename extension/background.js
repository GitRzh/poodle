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
    chrome.contextMenus.create({ id: "poodle-simplify",  title: "Simplify This",       contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-translate", title: "Translate and Explain", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-factcheck", title: "Fact Check",           contexts: ["selection"] });
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
// MV3 service workers can be killed mid-fetch causing
// "message port closed" — fix: resolve inside a kept-alive
// async IIFE and always call sendResponse exactly once.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "BACKEND_REQUEST") return false;

  // Immediately kick off async work — return true keeps port open
  (async () => {
    try {
      const res = await fetch(`${BACKEND}${message.endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(message.body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        sendResponse({ error: err.detail || `Backend error ${res.status}` });
        return;
      }

      sendResponse({ result: await res.json() });

    } catch (e) {
      // Most likely cause: backend not running
      sendResponse({ error: "Backend unreachable — is uvicorn running?" });
    }
  })();

  return true; // MUST return true to keep message channel open for async
});