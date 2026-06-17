// ═══════════════════════════════════════════════════════
// POODLE — background.js
// ═══════════════════════════════════════════════════════

// Replace this with your Koyeb URL after deploying
const BACKEND = "https://your-app.koyeb.app";

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
      sendResponse({ error: "Backend unreachable — is the server running?" });
    }
  })();

  return true;
});