// ═══════════════════════════════════════════════════════
// POODLE — background.js
// ═══════════════════════════════════════════════════════

const LOCAL   = "http://localhost:8000";
const REMOTE = "https://rzhface-poodle.hf.space"

// Try local first, fall back to remote
async function fetchBackend(endpoint, body) {
  for (const base of [LOCAL, REMOTE]) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body)
      });
      if (res.ok) return { result: await res.json() };
    } catch (_) {
      // this server not reachable, try next
    }
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

  (async () => {
    const response = await fetchBackend(message.endpoint, message.body);
    sendResponse(response);
  })();

  return true;
});
