// ── Guard against double-injection ─────────────────────
// content.js is registered in manifest.json's content_scripts AND can be
// manually re-injected by popup.js's send() fallback when sendMessage fails
// (e.g. right after install, before the page has the auto-injected copy
// listening yet). Re-running this file in the same page redeclares `state`
// and throws, killing every Poodle feature on that tab. Bail out early if
// we've already run here.
if (window.__poodleContentLoaded__) {
  // Already running on this page — do nothing.
} else {
  window.__poodleContentLoaded__ = true;

// ── State ─────────────────────────────────────────────
const state = {
  linkCheckEnabled: false,
  simplifyEnabled: false,
  simplifyLevel: "simple",
  translateEnabled: false,
  translateLang: "English",
  factCheckEnabled: false,
  dark: false,
  popupFontSize: "medium"
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
  "translateEnabled","translateLang","factCheckEnabled","theme","popupFontSize"
], (s) => {
  state.dark            = s.theme === "dark";
  state.linkCheckEnabled = s.linkCheckEnabled  || false;
  state.simplifyEnabled  = s.simplifyEnabled   || false;
  state.simplifyLevel    = s.simplifyLevel     || "simple";
  state.translateEnabled = s.translateEnabled  || false;
  state.translateLang    = s.translateLang     || "English";
  state.factCheckEnabled = s.factCheckEnabled  || false;
  state.popupFontSize    = s.popupFontSize     || "medium";

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
// FEATURE 1b — SUMMARIZE SELECTION (context-menu)
// ═══════════════════════════════════════════════════════
let _summarizeInFlight = false;
let _summarizeCache    = null; // { key, result }

async function runSummarizeSelection(text, length, format, fontSize) {
  if (_summarizeInFlight) return;

  // ── Warn if selection is too short for a meaningful summary ──
  if (text.length < 80) {
    const popup = createInlinePopup("Summary");
    setInlineHTML(popup, `
      <div style="color:#b8860b;font-size:13px;line-height:1.6;padding:4px 0">
        ⚠ Selection is too short (${text.length} chars). Please select more text for an accurate summary.
      </div>
    `);
    return;
  }

  const cacheKey = text + "|" + length + "|" + format + "|" + fontSize;
  const popup = createInlinePopup("Summary");
  showInlineLoading(popup);

  if (_summarizeCache && _summarizeCache.key === cacheKey) {
    renderSummaryIntoPopup(popup, _summarizeCache.result, format);
    return;
  }

  _summarizeInFlight = true;
  try {
    const data = await backendRequest("/summarize", {
      text:   text.slice(0, 4000),
      length: length || "medium",
      format: format || "paragraph"
    });
    const result = data.result || "";
    _summarizeCache = { key: cacheKey, result };
    renderSummaryIntoPopup(popup, result, format);
  } catch (e) {
    setInlineContent(popup, "Error: " + e.message, true);
  } finally {
    _summarizeInFlight = false;
  }
}

// Strip common LLM preamble lines from bullet output
function stripPreamble(lines) {
  const preambleRe = /^(here|below|sure|certainly|of course|the following)/i;
  return lines.filter(l => !preambleRe.test(l.trim()));
}

function renderSummaryIntoPopup(popup, result, format) {
  if (format === "bullets") {
    const lines = stripPreamble(result.split("\n").filter(l => l.trim()));
    setInlineHTML(popup, `<ul style="padding-left:18px;line-height:1.8">` +
      lines.map(l => `<li>${escHtml(l.replace(/^[-*•]\s*/, ""))}</li>`).join("") + "</ul>");
  } else {
    setInlineHTML(popup, result.split("\n\n")
      .map(p => `<p style="margin-bottom:10px">${escHtml(p)}</p>`).join(""));
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
      <div class="li-header">
        <div class="li-domain" style="margin-bottom:0">${escHtml(domain)}</div>
        <select class="li-fontsize-select" title="Text size" aria-label="Text size">
          <option value="small">S</option>
          <option value="medium">M</option>
          <option value="large">L</option>
          <option value="xl">XL</option>
        </select>
      </div>
      <div class="li-row li-muted" id="li-dest-row">→ ${escHtml(dest)}</div>
      <div class="li-row ${isHttps ? "li-ok" : "li-warn"}">${isHttps ? "✓ HTTPS secure" : "✗ Not HTTPS — unencrypted"}</div>
      <div class="li-row" id="li-age-row">Checking age…</div>
      <div class="li-row" id="li-typo-row">Checking…</div>
    `;
    linkCard.classList.add("visible");
    if (isDark()) linkCard.classList.add("dark");

    // Wire font-size selector
    const fsSelect = linkCard.querySelector(".li-fontsize-select");
    fsSelect.value = state.popupFontSize || "medium";
    applyLinkCardFontSize(state.popupFontSize || "medium");
    fsSelect.addEventListener("change", (e) => {
      e.stopPropagation();
      state.popupFontSize = e.target.value;
      chrome.storage.sync.set({ popupFontSize: e.target.value });
      applyLinkCardFontSize(e.target.value);
    });
    fsSelect.addEventListener("mousedown", (e) => e.stopPropagation());

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
let _lastPopupPos = null; // remember last drag position

function createInlinePopup(label) {
  if (inlinePopup) inlinePopup.remove();

  const sel   = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const rect  = range ? range.getBoundingClientRect() : null;

  inlinePopup = document.createElement("div");
  inlinePopup.id = "poodle-inline-result";
  if (isDark()) inlinePopup.classList.add("dark");
  inlinePopup.innerHTML = `
    <div class="ir-label" id="poodle-drag-handle">
      <span class="ir-drag-icon" title="Drag to move">⠿</span>
      <span class="ir-title">${escHtml(label)}</span>
      <select class="ir-fontsize-select" title="Text size" aria-label="Text size">
        <option value="small">S</option>
        <option value="medium">M</option>
        <option value="large">L</option>
        <option value="xl">XL</option>
      </select>
      <button class="ir-close" aria-label="Close">✕</button>
    </div>
    <div id="poodle-ir-body">Loading…</div>
  `;
  inlinePopup.querySelector(".ir-close").addEventListener("click", () => {
    inlinePopup.remove();
    inlinePopup = null;
  });

  // ── Font size selector ────────────────────────────────
  const fsSelect = inlinePopup.querySelector(".ir-fontsize-select");
  fsSelect.value = state.popupFontSize || "medium";
  applyPopupFontSize(inlinePopup, fsSelect.value);
  fsSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    state.popupFontSize = e.target.value;
    chrome.storage.sync.set({ popupFontSize: e.target.value });
    applyPopupFontSize(inlinePopup, e.target.value);
  });
  fsSelect.addEventListener("mousedown", (e) => e.stopPropagation());

  document.body.appendChild(inlinePopup);

  // ── Position: use last drag pos, or near selection, or fallback ──
  if (_lastPopupPos) {
    inlinePopup.style.position = "fixed";
    inlinePopup.style.top  = _lastPopupPos.top  + "px";
    inlinePopup.style.left = _lastPopupPos.left + "px";
  } else if (rect) {
    // position fixed relative to viewport
    // The popup can grow up to ~340px (header + 280px body cap + padding),
    // so reserve that much room rather than an arbitrary 200px guess —
    // otherwise long results spill off the bottom of the screen.
    const POPUP_MAX_HEIGHT = 340;
    const top  = Math.min(rect.bottom + 8, window.innerHeight - POPUP_MAX_HEIGHT);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 320);
    inlinePopup.style.position = "fixed";
    inlinePopup.style.top  = Math.max(8, top)  + "px";
    inlinePopup.style.left = left + "px";
  } else {
    inlinePopup.style.position = "fixed";
    inlinePopup.style.top  = "80px";
    inlinePopup.style.right = "20px";
    inlinePopup.style.left = "auto";
  }

  // ── Drag logic ────────────────────────────────────────
  const handle = inlinePopup.querySelector("#poodle-drag-handle");
  let dragging = false, startX, startY, origLeft, origTop;

  handle.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("ir-close")) return;
    dragging = true;
    const box = inlinePopup.getBoundingClientRect();
    startX   = e.clientX;
    startY   = e.clientY;
    origLeft = box.left;
    origTop  = box.top;
    inlinePopup.style.right = "auto";
    inlinePopup.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - inlinePopup.offsetWidth));
    const newTop  = Math.max(0, Math.min(origTop  + dy, window.innerHeight - inlinePopup.offsetHeight));
    inlinePopup.style.left = newLeft + "px";
    inlinePopup.style.top  = newTop  + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    if (inlinePopup) {
      const box = inlinePopup.getBoundingClientRect();
      _lastPopupPos = { top: box.top, left: box.left };
    }
  });

  return inlinePopup;
}

// ── Apply font size to inline popup body ─────────────
function applyPopupFontSize(popup, size) {
  const sizeMap = { small: "13px", medium: "15px", large: "18px", xl: "22px" };
  const body = popup ? popup.querySelector("#poodle-ir-body") : null;
  if (!body) return;
  const fs = sizeMap[size] || "15px";
  body.style.fontSize = fs;
  // Also apply to all child elements so inline styles don't override
  body.querySelectorAll("p, li, div, span").forEach(el => {
    el.style.fontSize = fs;
  });
}

// ── Apply font size to link check card rows ───────────
function applyLinkCardFontSize(size) {
  if (!linkCard) return;
  const sizeMap = { small: "11px", medium: "13px", large: "15px", xl: "18px" };
  const fs = sizeMap[size] || "13px";
  linkCard.querySelectorAll(".li-row, .li-domain, #li-dest-row").forEach(el => {
    el.style.fontSize = fs;
  });
}

function showFeatureDisabledNotice() {
  const popup = createInlinePopup("Poodle");
  setInlineContent(popup, "Please turn on this setting in the Poodle popup before proceeding.");
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
  applyPopupFontSize(popup, state.popupFontSize || "medium");
}

function setInlineHTML(popup, html) {
  const body = popup ? popup.querySelector("#poodle-ir-body") : null;
  if (!body) return;
  body.innerHTML = html;
  applyPopupFontSize(popup, state.popupFontSize || "medium");
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

    case "FEATURE_DISABLED_NOTICE":
      showFeatureDisabledNotice();
      break;

    case "SUMMARIZE_SELECTION":
      runSummarizeSelection(msg.text, msg.length, msg.format, msg.fontSize);
      break;

    case "SIMPLIFY_SELECTION":
      runSimplifySelection(msg.text, msg.level || state.simplifyLevel);
      break;

    case "TRANSLATE_SELECTION":
      runTranslateSelection(msg.text, msg.lang || state.translateLang);
      break;

    case "FACTCHECK_SELECTION":
      runFactCheck(msg.text);
      break;

    case "TOGGLE_LINKCHECK":
      state.linkCheckEnabled = msg.enabled;
      // Always teardown first — ensures a fresh card is created even on tabs
      // where an older injected copy already ran initLinkCheck() once.
      teardownLinkCheck();
      if (msg.enabled) initLinkCheck();
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

    case "UPDATE_POPUP_FONTSIZE":
      state.popupFontSize = msg.size;
      if (inlinePopup) {
        const sel = inlinePopup.querySelector(".ir-fontsize-select");
        if (sel) sel.value = msg.size;
        applyPopupFontSize(inlinePopup, msg.size);
      }
      if (linkCard) {
        const lsel = linkCard.querySelector(".li-fontsize-select");
        if (lsel) lsel.value = msg.size;
        applyLinkCardFontSize(msg.size);
      }
      break;
  }
});

} // end double-injection guard