# Poodle — Browser Toolkit

> Highlight text, hover a link, or click a button. Get instant summaries, translations, simplifications, fact checks, and link safety — on any webpage.

---

## What it does

Poodle is a browser extension that layers AI tools directly onto your browsing experience. No switching tabs, no copy-pasting. Select text and right-click, or hover a link, and Poodle acts on it instantly.

**Features:**
- Highlight any text and summarise — short, medium, or full length, prose or bullets
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
| Deployment (Backend Only) | HuggingFace Space |

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

**1. Get a free Groq API key**

Go to [console.groq.com/keys](https://console.groq.com/keys) — sign up, create a key. Free tier is 14,400 requests/day. This is required for all AI features.

**2. Download the extension**

Download or clone this repo. The extension is in the `extension/` folder — no build step, no npm install.

**3. Load in browser**

Go to `brave://extensions` or `chrome://extensions`, turn on Developer Mode, click Load unpacked, select the `extension/` folder.

**4. Add your key**

Click the Poodle icon in your toolbar → Settings / API key → paste your `gsk_...` key → Save.

**5. Use it**

Toggle features from the popup. All AI features now work using your own Groq key — fast, free, and private.

---

## Run the backend locally

**1. Install dependencies**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**2. Create `backend/.env`**
```
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama3-8b-8192
```

**3. Start the server**
```bash
uvicorn main:app --reload
```

**4. Point the extension at localhost**

In `extension/background.js`:
```js
const BACKEND = "http://localhost:8000";
```

Reload the extension in `brave://extensions`.

---

## Notes

- **Bring your own key.** Each user needs a free Groq API key. Get one at [console.groq.com/keys](https://console.groq.com/keys) in under a minute. Keys are stored locally in your browser and never leave your machine except to call Groq directly.
- **Groq free tier** has rate limits. The app trims input to 8k chars per request to stay within them.
- **Domain age** calls RDAP.org directly — no API key needed, but some newer TLDs may return no data.
- **Sessions are stateless.** Nothing is stored anywhere. All processing happens in your browser and the backend.
- **Private pages** work fine — the extension reads what your browser already rendered.

---

*Built for the FlowZint AI Hackathon 2026.*
