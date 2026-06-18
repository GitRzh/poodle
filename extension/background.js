// ═══════════════════════════════════════════════════════
// POODLE — background.js
// ═══════════════════════════════════════════════════════

const LOCAL  = "http://localhost:8000";
const REMOTE = "https://rzhface-poodle.hf.space";

// Pages a content script can never be injected into.
const RESTRICTED_URL_REGEX = /^(chrome|brave|edge|about|file|chrome-extension):/;

async function fetchBackend(endpoint, body) {
  let lastResponse = null;

  for (const base of [LOCAL, REMOTE]) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body)
      });
      if (res.ok) return { result: await res.json() };
      lastResponse = res;          // we connected fine, backend just returned an error status
    } catch (_) {
      // genuine network failure for this base — fall through and try the next one
    }
  }

  if (lastResponse) {
    if (lastResponse.status === 401) {
      return { error: "Add your Groq key in Settings / API key." };
    }
    if (lastResponse.status === 429) {
      return { error: "Groq's free-tier rate limit was hit — wait a moment and try again." };
    }
    let detail = "";
    try { detail = (await lastResponse.json())?.detail || ""; } catch (_) {}
    return { error: `Backend error (${lastResponse.status})${detail ? ": " + detail : ""}` };
  }

  return { error: "Backend unreachable — local and remote both failed." };
}

// ── Brief toolbar-badge feedback ──────────────────────
// Context-menu clicks have no popup DOM to write a notice into, so a
// transient badge is the lightest way to surface "this didn't work"
// without requesting the "notifications" permission.
function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#b33" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

// ── Context menu setup ────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "poodle-summarize", title: "Summarize This",       contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-simplify",  title: "Simplify This",        contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-translate", title: "Translate and Explain", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "poodle-factcheck", title: "Fact Check",           contexts: ["selection"] });
  });
});

// ── Context menu click ────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !info.selectionText) return;

  // Selection-based context menu items can still appear on chrome:// /
  // brave:// pages — but there's no content script there to receive the
  // message. Bail out with badge feedback instead of failing silently.
  if (tab.url && RESTRICTED_URL_REGEX.test(tab.url)) {
    flashBadge("!");
    return;
  }

  const typeMap = {
    "poodle-simplify":  "SIMPLIFY_SELECTION",
    "poodle-translate": "TRANSLATE_SELECTION",
    "poodle-factcheck": "FACTCHECK_SELECTION",
    "poodle-summarize": "SUMMARIZE_SELECTION"
  };
  const type = typeMap[info.menuItemId];
  if (!type) return;
  chrome.storage.sync.get(["simplifyLevel", "translateLang", "theme", "qsLength", "qsFormat", "qsFontSize"], (s) => {
    chrome.tabs.sendMessage(tab.id, {
      type,
      text:     info.selectionText,
      level:    s.simplifyLevel || "simple",
      lang:     s.translateLang  || "English",
      length:   s.qsLength      || "medium",
      format:   s.qsFormat      || "paragraph",
      fontSize: s.qsFontSize    || "medium",
      dark:     s.theme === "dark"
    }, () => { void chrome.runtime.lastError; });
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