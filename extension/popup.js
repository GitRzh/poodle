const themeToggle = document.getElementById("theme-toggle");
const themeIcon   = document.getElementById("theme-icon");
const openOptions = document.getElementById("open-options");

const DEFAULTS = {
  theme: "light",
  quickSummaryEnabled: false,
  qsLength: "medium",
  qsFormat: "paragraph",
  qsFontSize: "medium",
  simplifyEnabled: false,
  simplifyLevel: "simple",
  translateEnabled: false,
  translateLang: "English",
  linkCheckEnabled: false,
  factCheckEnabled: false
};

// ── Boot ──────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    document.body.classList.toggle("dark", s.theme === "dark");
    themeIcon.innerHTML = s.theme === "dark" ? "&#9728;" : "&#9789;";

    bind("quicksummary-toggle", "quicksummary-settings", s.quickSummaryEnabled);
    document.getElementById("qs-length").value   = s.qsLength;
    document.getElementById("qs-format").value   = s.qsFormat;
    document.getElementById("qs-fontsize").value = s.qsFontSize;

    bind("simplify-toggle", "simplify-settings", s.simplifyEnabled);
    document.getElementById("simplify-level").value = s.simplifyLevel;

    bind("translate-toggle", "translate-settings", s.translateEnabled);
    document.getElementById("translate-lang").value = s.translateLang;

    bind("linkcheck-toggle", "linkcheck-settings", s.linkCheckEnabled);
    bind("factcheck-toggle", "factcheck-settings", s.factCheckEnabled);
  });
}

function bind(toggleId, panelId, enabled) {
  const el = document.getElementById(toggleId);
  const pan = document.getElementById(panelId);
  if (el)  el.checked = enabled;
  if (pan) pan.classList.toggle("hidden", !enabled);
}

function save(key, value) {
  const o = {}; o[key] = value; chrome.storage.sync.set(o);
}

// ── Messaging ─────────────────────────────────────────
function send(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    if (tab.url && /^(chrome|brave|edge|about):/.test(tab.url)) {
      notice("Poodle can't run on this type of page."); return;
    }
    chrome.tabs.sendMessage(tab.id, message, (res) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ["content.js"] },
          () => {
            if (chrome.runtime.lastError) { notice("Could not run on this page. Try reloading."); return; }
            chrome.tabs.sendMessage(tab.id, message, callback || (() => {}));
          }
        );
      } else if (callback) callback(res);
    });
  });
}

function notice(text) {
  let el = document.getElementById("poodle-popup-notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "poodle-popup-notice";
    document.body.appendChild(el);
  }
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 4000);
}

function checkPage() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && /^(chrome|brave|edge|about|file|chrome-extension):/.test(tab.url))
      notice("Not supported on this page.");
  });
}

// ── Theme ─────────────────────────────────────────────
themeToggle.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  themeIcon.innerHTML = dark ? "&#9728;" : "&#9789;";
  save("theme", dark ? "dark" : "light");
  send({ type: "THEME_CHANGE", dark });
});

// ── Quick Summary ─────────────────────────────────────
document.getElementById("quicksummary-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  document.getElementById("quicksummary-settings").classList.toggle("hidden", !on);
  save("quickSummaryEnabled", on);
});
document.getElementById("qs-length").addEventListener("change",   (e) => save("qsLength",   e.target.value));
document.getElementById("qs-format").addEventListener("change",   (e) => save("qsFormat",   e.target.value));
document.getElementById("qs-fontsize").addEventListener("change", (e) => save("qsFontSize", e.target.value));
document.getElementById("quicksummary-btn").addEventListener("click", () => {
  chrome.storage.sync.get(["qsLength","qsFormat","qsFontSize"], (s) => {
    send({ type: "QUICK_SUMMARY", length: s.qsLength, format: s.qsFormat, fontSize: s.qsFontSize });
  });
});

// ── Simplify This ─────────────────────────────────────
document.getElementById("simplify-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  document.getElementById("simplify-settings").classList.toggle("hidden", !on);
  save("simplifyEnabled", on);
  send({ type: "TOGGLE_SIMPLIFY", enabled: on });
});
document.getElementById("simplify-level").addEventListener("change", (e) => {
  save("simplifyLevel", e.target.value);
  send({ type: "UPDATE_SIMPLIFY_LEVEL", level: e.target.value });
});

// ── Translate & Explain ───────────────────────────────
document.getElementById("translate-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  document.getElementById("translate-settings").classList.toggle("hidden", !on);
  save("translateEnabled", on);
  send({ type: "TOGGLE_TRANSLATE", enabled: on });
});
document.getElementById("translate-lang").addEventListener("change", (e) => {
  save("translateLang", e.target.value);
  send({ type: "UPDATE_TRANSLATE_LANG", lang: e.target.value });
});

// ── Link Check ────────────────────────────────────────
document.getElementById("linkcheck-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  document.getElementById("linkcheck-settings").classList.toggle("hidden", !on);
  save("linkCheckEnabled", on);
  send({ type: "TOGGLE_LINKCHECK", enabled: on });
});

// ── Fact Check ────────────────────────────────────────
document.getElementById("factcheck-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  document.getElementById("factcheck-settings").classList.toggle("hidden", !on);
  save("factCheckEnabled", on);
  send({ type: "TOGGLE_FACTCHECK", enabled: on });
});

// ── Options ───────────────────────────────────────────
openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

loadSettings();
checkPage();