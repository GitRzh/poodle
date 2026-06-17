# Poodle — AI Browser Extension

> Highlight text, hover a link, or click a button. Get instant summaries, translations, simplifications, fact checks, and link safety — on any webpage.

---

## What it does

Poodle is a browser extension that layers AI tools directly onto your browsing experience. No switching tabs, no copy-pasting. Select text and right-click, or hover a link, and Poodle acts on it instantly.

**Features:**
- Summarise any webpage in one click — short, medium, or full length, prose or bullets
- Highlight any text and simplify it to plain English, child level, or teen level
- Highlight any text and translate it to 11 languages with cultural notes on idioms
- Highlight any claim and fact-check it — returns likely true, misleading, or unverifiable
- Hover any link for 1.5 seconds — see HTTPS status, domain age, and phishing detection

---

## Tech Stack

| Layer | Details |
|---|---|
| Extension | Manifest V3, vanilla JS/CSS, no build step |
| Backend | Python, FastAPI, httpx |
| LLM | Llama 3 8B via Groq API |
| Domain age | RDAP.org (no key needed) |
| Deployment | Koyeb |

---

## File Structure

```
poodle/
├── backend/
│   ├── routes/
│   │   ├── summarize.py        # POST /summarize
│   │   ├── simplify.py         # POST /simplify
│   │   ├── translate.py        # POST /translate
│   │   ├── factcheck.py        # POST /factcheck
│   │   └── domain_age.py       # GET  /domain-age
│   ├── services/
│   │   ├── llm_client.py       # Groq API client
│   │   └── prompts.py          # All prompt templates
│   ├── main.py                 # FastAPI app, CORS, router registration
│   ├── config.py               # Loads .env
│   └── requirements.txt
└── extension/
    ├── icons/
    ├── background.js           # Service worker, backend proxy
    ├── content.js              # All in-page UI and feature logic
    ├── content.css             # Injected styles for overlays
    ├── popup.html / .js / .css # Extension popup
    ├── options.html / .js      # Settings page
    └── manifest.json
```

---

## Try the extension

**1. Download**

Download or clone this repo. The extension is in the `extension/` folder — no build step needed.

**2. Load in browser**

Go to `brave://extensions` or `chrome://extensions`, turn on Developer Mode, click Load unpacked, and select the `extension/` folder.

**3. Use it**

The Poodle icon appears in your toolbar. Toggle features from the popup. The backend is already running — no setup needed.

---

## Run the backend locally

**1. Install dependencies**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**2. Create `backend/.env`**
```
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama3-8b-8192
```

Get a free Groq key at [console.groq.com/keys](https://console.groq.com/keys). Free tier is 14,400 requests/day.

**3. Start the server**
```bash
uvicorn main:app --reload
```

**4. Point the extension at localhost**

In `extension/background.js`, change:
```js
const BACKEND = "http://localhost:8000";
```

Reload the extension in `brave://extensions`.

---

## Deploy backend (Koyeb)

1. Push this repo to GitHub
2. Go to [koyeb.com](https://koyeb.com) — New App — GitHub — select this repo
3. Set root directory to `backend/`
4. Add environment variable: `GROQ_API_KEY=gsk_your_key_here`
5. Deploy — get a URL like `https://poodle-yourname.koyeb.app`
6. Update `extension/background.js`:
```js
const BACKEND = "https://poodle-yourname.koyeb.app";
```
7. Reload the extension

---

## Notes

- **Groq free tier** has rate limits. The app trims input to 8k chars per request to stay within them.
- **Domain age** calls RDAP.org directly — no API key needed, but some newer TLDs may return no data.
- **Sessions are stateless.** Nothing is stored anywhere. All processing happens in your browser and the backend.
- **Private pages** (login-walled content) work fine — the extension reads what your browser already rendered.

---

*Built for the FlowZint AI Hackathon 2026.*