// ── State ─────────────────────────────────────────────
const state = {
  linkCheckEnabled: false,
  simplifyEnabled: false,
  simplifyLevel: "simple",
  translateEnabled: false,
  translateLang: "English",
  factCheckEnabled: false,
  dark: false
};

// ── Helpers ───────────────────────────────────────────
function isDark() {
  return state.dark;
}

function backendRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), 30000);
    try {
      chrome.runtime.sendMessage({ type: "BACKEND_REQUEST", endpoint, body }, (res) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res) return reject(new Error("No response from background"));
        if (res.error) return reject(new Error(res.error));
        resolve(res.result);
      });
    } catch(e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

function getPageText() {
  const main = document.querySelector("article, main, [role='main']") || document.body;
  return main.innerText.slice(0, 8000);
}

// ── Init from storage ─────────────────────────────────
chrome.storage.sync.get([
  "linkCheckEnabled","simplifyEnabled","simplifyLevel",
  "translateEnabled","translateLang","factCheckEnabled","theme"
], (s) => {
  state.dark            = s.theme === "dark";
  state.linkCheckEnabled = s.linkCheckEnabled  || false;
  state.simplifyEnabled  = s.simplifyEnabled   || false;
  state.simplifyLevel    = s.simplifyLevel     || "simple";
  state.translateEnabled = s.translateEnabled  || false;
  state.translateLang    = s.translateLang     || "English";
  state.factCheckEnabled = s.factCheckEnabled  || false;

  if (state.linkCheckEnabled) initLinkCheck();
});

// ═══════════════════════════════════════════════════════
// FEATURE 1 — QUICK SUMMARY
// ═══════════════════════════════════════════════════════
async function runQuickSummary(length, format, fontSize) {
  const panel = getOrCreatePanel("poodle-summary-panel", "Quick Summary");
  showLoading(panel);

  const lengthMap  = { short: "2-3 sentences", medium: "1 paragraph", full: "2-3 paragraphs" };
  const formatNote = format === "bullets" ? " Use bullet points." : " Write in prose.";
  const prompt = `Summarise the following webpage content in ${lengthMap[length] || "1 paragraph"}.${formatNote} Use plain, simple language.\n\n${getPageText()}`;

  try {
    const data = await backendRequest("/summarize", {
      text:   getPageText(),
      length: length   || "medium",
      format: format   || "paragraph"
    });
    const result = data.result || "";
    const content = panel.querySelector(".panel-content");
    content.classList.remove("panel-loading");

    const sizeMap = { small: "14px", medium: "17px", large: "20px", xl: "24px" };
    content.style.fontSize = sizeMap[fontSize] || "17px";

    if (format === "bullets") {
      const lines = result.split("\n").filter(l => l.trim());
      content.innerHTML = "<ul style='padding-left:18px;line-height:1.8'>" +
        lines.map(l => `<li>${l.replace(/^[-*•]\s*/, "")}</li>`).join("") + "</ul>";
    } else {
      content.innerHTML = result.split("\n\n").map(p => `<p style="margin-bottom:10px">${p}</p>`).join("");
    }
  } catch (e) {
    showError(panel, e.message);
  }
}

// ═══════════════════════════════════════════════════════
// FEATURE 2 — SIMPLIFY THIS
// ═══════════════════════════════════════════════════════
async function runSimplifySelection(text, level) {
  const levelMap = {
    child:  "a child aged 8-10 (very simple words, very short sentences)",
    simple: "anyone (plain everyday English, no jargon)",
    teen:   "a teenager aged 14-16 (clear and straightforward)"
  };
  const prompt = `Rewrite the following text so it is easy to understand for ${levelMap[level] || levelMap.simple}. Keep the same meaning. Do not add extra explanation, just rewrite it.\n\n"${text}"`;

  const popup = createInlinePopup("Simplified");
  showInlineLoading(popup);

  try {
    const data = await backendRequest("/simplify", { text, level: level || "simple" });
    setInlineContent(popup, data.result || "");
  } catch (e) {
    setInlineContent(popup, "Error: " + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════
// FEATURE 3 — TRANSLATE & EXPLAIN
// ═══════════════════════════════════════════════════════
async function runTranslateSelection(text, lang) {
  const prompt = `You are a translator. Do two things:
1. Translate the following text into ${lang}.
2. After the translation, on a new line starting with "NOTE:", briefly explain any idioms, cultural references, or figures of speech from the original that might be confusing (if none, write "NOTE: No special notes.").

Text: "${text}"`;

  const popup = createInlinePopup(`Translated to ${lang}`);
  showInlineLoading(popup);

  try {
    const data = await backendRequest("/translate", { text, lang: lang || "English" });
    let html = `<div style="margin-bottom:8px">${escHtml(data.translation || "")}</div>`;
    if (data.note) {
      html += `<div class="poodle-cultural-note${isDark() ? " dark" : ""}">
        <div class="poodle-cultural-note-label">Cultural note</div>
        ${escHtml(data.note)}
      </div>`;
    }
    setInlineHTML(popup, html);
  } catch (e) {
    setInlineContent(popup, "Error: " + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════
// FEATURE 4 — LINK CHECK
// ═══════════════════════════════════════════════════════
let linkCard = null;
let linkHideTimer = null;
let linkHoverTimer = null;   // hover delay timer

function initLinkCheck() {
  if (document.getElementById("poodle-link-info-card")) return;
  linkCard = document.createElement("div");
  linkCard.id = "poodle-link-info-card";
  if (isDark()) linkCard.classList.add("dark");
  document.body.appendChild(linkCard);

  document.addEventListener("mouseover", onLinkHover);
  document.addEventListener("mouseout",  onLinkOut);
}

function teardownLinkCheck() {
  document.removeEventListener("mouseover", onLinkHover);
  document.removeEventListener("mouseout",  onLinkOut);
  clearTimeout(linkHoverTimer);
  clearTimeout(linkHideTimer);
  if (linkCard) { linkCard.remove(); linkCard = null; }
}

function onLinkHover(e) {
  const a = e.target.closest("a[href]");
  if (!a) return;
  clearTimeout(linkHideTimer);
  clearTimeout(linkHoverTimer);          // cancel any pending show
  linkHoverTimer = setTimeout(() => {
    showLinkCard(a.href);
  }, 1500);                              // 2.5s delay before showing
}

function onLinkOut(e) {
  clearTimeout(linkHoverTimer);          // cancel show if user moved away early
  linkHideTimer = setTimeout(() => {
    if (linkCard) linkCard.classList.remove("visible");
  }, 300);
}

function showLinkCard(href) {
  if (!linkCard) return;
  try {
    const url     = new URL(href);
    const domain  = url.hostname.replace(/^www\./, "");
    const isHttps = url.protocol === "https:";
    const dest    = url.hostname + (url.pathname !== "/" ? url.pathname.slice(0, 30) : "");

    linkCard.innerHTML = `
      <div class="li-domain">${escHtml(domain)}</div>
      <div class="li-row li-muted" id="li-dest-row">→ ${escHtml(dest)}</div>
      <div class="li-row ${isHttps ? "li-ok" : "li-warn"}">${isHttps ? "✓ HTTPS secure" : "✗ Not HTTPS — unencrypted"}</div>
      <div class="li-row" id="li-age-row">Checking age…</div>
      <div class="li-row" id="li-typo-row">Checking…</div>
    `;
    linkCard.classList.add("visible");
    if (isDark()) linkCard.classList.add("dark");

    checkDomainAge(domain);
    checkTypoSquat(domain);
  } catch (_) {}
}

async function checkDomainAge(domain) {
  const row = document.getElementById("li-age-row");
  if (!row) return;
  try {
    let res = null;
    for (const base of ["http://localhost:8000", "https://rzhface-poodle.hf.space"]) {
      try {
        res = await fetch(`${base}/domain-age?domain=${encodeURIComponent(domain)}`);
        if (res.ok) break;
      } catch(_) {}
    }
    if (!res || !res.ok) throw new Error("both failed");
    const data = await res.json();
    if (data.age_years !== null && data.age_years !== undefined) {
      const years = parseFloat(data.age_years);
      const young = years < 0.5;
      row.className   = `li-row ${young ? "li-warn" : "li-ok"}`;
      row.textContent = `${young ? "✗" : "✓"} ${years.toFixed(1)} yr old${young ? " — very new" : ""}${data.tld_category ? " · " + data.tld_category : ""}`;
    } else {
      row.className   = "li-row li-muted";
      row.textContent = "✓ Age unavailable";
    }
  } catch (_) {
    row.className   = "li-row li-muted";
    row.textContent = "Age check failed (backend down?)";
  }
}

function checkTypoSquat(domain) {
  const row = document.getElementById("li-typo-row");
  if (!row) return;

  const brands = ["google","facebook","amazon","paypal","apple","microsoft","netflix","instagram","twitter","youtube","linkedin","dropbox","github"];
  const clean  = domain.replace(/\.(com|net|org|io|co|uk)$/, "");
  let hit = null;

  for (const brand of brands) {
    if (clean !== brand && levenshtein(clean, brand) <= 2 && clean.includes(brand.slice(0,3))) {
      hit = brand; break;
    }
  }

  if (hit) {
    row.className = "li-row li-warn";
    row.innerHTML = `<div class="li-alert">⚠ Looks similar to <strong>${hit}.com</strong> — possible phishing</div>`;
  } else {
    row.className = "li-row li-ok";
    row.textContent = "✓ No phishing flags";
  }
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ═══════════════════════════════════════════════════════
// FEATURE 5 — FACT CHECK
// ═══════════════════════════════════════════════════════
async function runFactCheck(text) {
  const prompt = `You are a fact-checker. Analyse the following claim and respond ONLY with this JSON (no other text):
{
  "verdict": "likely true" | "misleading" | "unverifiable",
  "reason": "one or two sentence explanation"
}

Claim: "${text}"`;

  const popup = createInlinePopup("Fact Check");
  showInlineLoading(popup);

  try {
    const data    = await backendRequest("/factcheck", { text });
    const verdict = data.verdict || "unverifiable";
    const cls     = verdict === "likely true" ? "true" : verdict === "misleading" ? "misleading" : "unverifiable";
    setInlineHTML(popup, `
      <div class="poodle-verdict ${cls}${isDark() ? " dark" : ""}">${verdict.toUpperCase()}</div>
      <div style="font-size:13px;line-height:1.6">${escHtml(data.reason || "")}</div>
    `);
  } catch (e) {
    setInlineContent(popup, "Error: " + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════
// SHARED UI HELPERS
// ═══════════════════════════════════════════════════════
function getOrCreatePanel(id, title) {
  let panel = document.getElementById(id);
  if (panel) panel.remove();

  panel = document.createElement("div");
  panel.id = id;
  panel.className = "poodle-side-panel" + (isDark() ? " dark" : "");
  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">${title}</span>
      <button class="panel-close" aria-label="Close">✕</button>
    </div>
    <div class="panel-content panel-loading">Loading…</div>
  `;
  panel.querySelector(".panel-close").addEventListener("click", () => panel.remove());
  document.body.appendChild(panel);
  return panel;
}

function showLoading(panel) {
  const c = panel.querySelector(".panel-content");
  c.className = "panel-content panel-loading";
  c.textContent = "Loading…";
}

function showError(panel, msg) {
  const c = panel.querySelector(".panel-content");
  c.className = "panel-content panel-error";
  c.textContent = "Something went wrong: " + msg;
}

let inlinePopup = null;

function createInlinePopup(label) {
  if (inlinePopup) inlinePopup.remove();

  const sel   = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const rect  = range ? range.getBoundingClientRect() : null;

  inlinePopup = document.createElement("div");
  inlinePopup.id = "poodle-inline-result";
  if (isDark()) inlinePopup.classList.add("dark");
  inlinePopup.innerHTML = `
    <div class="ir-label">
      <button class="ir-close" aria-label="Close">✕</button>
      ${escHtml(label)}
    </div>
    <div id="poodle-ir-body">Loading…</div>
  `;
  inlinePopup.querySelector(".ir-close").addEventListener("click", () => inlinePopup.remove());

  document.body.appendChild(inlinePopup);

  if (rect) {
    const top  = rect.bottom + window.scrollY + 8;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 320);
    inlinePopup.style.top  = top  + "px";
    inlinePopup.style.left = Math.max(8, left) + "px";
  } else {
    inlinePopup.style.top  = "80px";
    inlinePopup.style.right = "20px";
    inlinePopup.style.left = "auto";
  }

  return inlinePopup;
}

function showInlineLoading(popup) {
  const body = popup ? popup.querySelector("#poodle-ir-body") : null;
  if (body) body.textContent = "Loading…";
}

function setInlineContent(popup, text, isError) {
  const body = popup ? popup.querySelector("#poodle-ir-body") : null;
  if (!body) return;
  body.style.color = isError ? "#b33" : "";
  body.textContent = text;
}

function setInlineHTML(popup, html) {
  const body = popup ? popup.querySelector("#poodle-ir-body") : null;
  if (body) body.innerHTML = html;
}

function escHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ── Apply theme to all open Poodle overlays ──────────
function applyThemeToAllOverlays(dark) {
  // Link hover card
  if (linkCard) linkCard.classList.toggle("dark", dark);

  // Inline popup (translate / simplify / factcheck)
  const inline = document.getElementById("poodle-inline-result");
  if (inline) inline.classList.toggle("dark", dark);

  // Side panel (quick summary)
  const panel = document.getElementById("poodle-summary-panel");
  if (panel) panel.classList.toggle("dark", dark);

  // Cultural note inside inline popup
  const note = document.querySelector(".poodle-cultural-note");
  if (note) note.classList.toggle("dark", dark);

  // Verdict badge inside inline popup
  const verdict = document.querySelector(".poodle-verdict");
  if (verdict) verdict.classList.toggle("dark", dark);
}

// ═══════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case "QUICK_SUMMARY":
      runQuickSummary(msg.length, msg.format, msg.fontSize);
      break;

    case "SIMPLIFY_SELECTION":
      if (state.simplifyEnabled)
        runSimplifySelection(msg.text, msg.level || state.simplifyLevel);
      break;

    case "TRANSLATE_SELECTION":
      if (state.translateEnabled)
        runTranslateSelection(msg.text, msg.lang || state.translateLang);
      break;

    case "FACTCHECK_SELECTION":
      if (state.factCheckEnabled)
        runFactCheck(msg.text);
      break;

    case "TOGGLE_LINKCHECK":
      state.linkCheckEnabled = msg.enabled;
      msg.enabled ? initLinkCheck() : teardownLinkCheck();
      break;

    case "TOGGLE_SIMPLIFY":
      state.simplifyEnabled = msg.enabled;
      break;

    case "UPDATE_SIMPLIFY_LEVEL":
      state.simplifyLevel = msg.level;
      break;

    case "TOGGLE_TRANSLATE":
      state.translateEnabled = msg.enabled;
      break;

    case "UPDATE_TRANSLATE_LANG":
      state.translateLang = msg.lang;
      break;

    case "TOGGLE_FACTCHECK":
      state.factCheckEnabled = msg.enabled;
      break;

    case "THEME_CHANGE":
      state.dark = msg.dark;
      applyThemeToAllOverlays(msg.dark);
      break;
  }
});