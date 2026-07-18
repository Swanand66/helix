# Chrome Web Store submission — copy-paste kit

Everything you need to fill out the Chrome Web Store listing for Helix. Upload `dist/helix-v0.1.0.zip` at https://chrome.google.com/webstore/devconsole (one-time $5 developer registration fee applies).

---

## Package

- **File**: `dist/helix-v0.1.0.zip`
- **Size**: ~23 KB
- **Manifest**: v3
- **Rebuild with**: `node scripts/package.mjs`

---

## Store listing fields

### Title (max 45 chars)
```
Helix — LLM token & cost meter
```

### Summary (max 132 chars)
```
See exactly how many tokens and dollars you're spending on ChatGPT and Claude, live. Local-only, no accounts, no cloud.
```

### Category
- **Primary**: Developer Tools
- **Secondary** (if a second one is offered): Productivity

### Language
- English (Worldwide)

### Detailed description (up to ~16 000 chars — the copy below is ~1400)

```markdown
Helix is a live token + cost meter for ChatGPT and Claude.

A small glowing ⌘ appears in the corner of chatgpt.com and claude.ai. It stays quiet until you send a message — then it lights up and pulses smoothly while the assistant is streaming its reply. Click it to see:

  • Today's total tokens + dollars, broken down by model
  • This month's total tokens + dollars, broken down by model
  • A rate card of what every model actually costs

Every measurement happens locally in your browser. Helix never sends your prompts anywhere, never asks for API keys, never asks for an account, never talks to any cloud service except once a day to refresh its price table from a public JSON file on GitHub.

WHAT IT TRACKS
  • ChatGPT (GPT-5, GPT-4o, GPT-4o mini, o3, o4, o4-mini)
  • Claude (Claude 5 Opus / Sonnet / Haiku, Claude 4.5 Opus / Sonnet / Haiku)
  • Fable
  • More via daily price refresh

HOW IT WORKS
Helix hooks the browser's fetch API in the ChatGPT and Claude tabs, watches for chat completion requests, and counts tokens on both the input you send and the assistant's streamed reply. Token counts are then multiplied by the current per-1M-token price and stored in chrome.storage.local.

PRICES STAY FRESH
When a provider changes their rates, we don't need to ship a new extension. A daily GitHub Action refreshes a hosted prices.json that Helix fetches once every 24 hours. New rates flow to every user automatically.

PRIVACY
  • No accounts, no cloud, no analytics
  • Your prompts never leave the browser
  • Only tokens counts + a model id + a timestamp are stored
  • You can wipe all local data with one click in the popup
  • Full source open on GitHub

LIMITATIONS (BEING HONEST)
  • Approximation-based token counts on Claude (~97% accurate; every stored entry is flagged as approximate)
  • Only works on chatgpt.com and claude.ai tabs (browser extension can't see the desktop apps)
  • Token counts, not billing counts — actual invoices may differ slightly from tracked totals

WHAT'S IN THE ROADMAP
  • Additional providers (Gemini, Perplexity)
  • Optional desktop app for tracking outside of the browser
  • Budget alerts + per-project tagging

Open source under MIT — https://github.com/Swanand66/helix
```

### Justification for permissions

The store review team asks you to justify each permission. Copy these into the corresponding fields:

**`storage`** —
> Stores local per-user token usage history so the popup and in-page panel can show today's and this month's totals. No data leaves the browser.

**`alarms`** —
> Schedules a once-per-24-hour refresh of the pricing table from a public GitHub JSON URL. This keeps the cost math current without shipping extension updates.

**Host permission for `https://chatgpt.com/*` and `https://claude.ai/*`** —
> Required to observe chat completion API requests on these two sites and count tokens as the assistant streams its reply. No data from these pages is sent anywhere.

**Host permission for `https://raw.githubusercontent.com/*`** —
> Required to fetch the daily-updated pricing table (a single JSON file at raw.githubusercontent.com/Swanand66/helix_price/main/prices.json). No user data is uploaded — only the file is downloaded.

### Single purpose (single-sentence description)
```
Show live token and cost usage while you chat on ChatGPT and Claude.
```

---

## Screenshots (upload 1–5 images at 1280×800 or 640×400)

**Minimum: 1 screenshot required. Recommended: 3–5.**

Suggested shots to capture (use Snipping Tool or Windows+Shift+S):

1. **Hero shot** — ChatGPT tab with a question being asked, orb glowing in the corner, panel open showing today's totals. This is your primary conversion image.
2. **Claude tab** — same shot but on claude.ai, showing the extension works there too.
3. **Popup open** — click the toolbar icon, screenshot the popup showing per-model breakdown.
4. **Idle state** — the orb sitting quiet with no chat happening (proves it's not distracting).
5. **The panel with real data** — a week or two of usage aggregated, with multiple models listed.

**Recommended dimensions:** 1280×800 (the store shows this at ~640×400 in listings but stores the full res).

**Screenshot tips:**
- Use a clean browser window (no extra bookmarks bar, no other extension icons if avoidable)
- Dark mode looks best for the ⌘ orb
- Crop tightly around the relevant UI — the reviewer + user should be able to see what the extension does in a glance

---

## Small promotional tile (440×280 — optional but recommended)

Design: dark background, glowing ⌘ on the left, "Helix" wordmark + tagline on the right.

Tagline options (pick one):
- **"See what your AI habit really costs."**
- **"A live token meter for ChatGPT and Claude."**
- **"Every prompt, priced. Right in your browser."**

---

## Website / support URL

- **Homepage URL**: `https://github.com/Swanand66/helix`
- **Support email**: (your email)
- **Privacy policy URL**: `https://github.com/Swanand66/helix/blob/main/PRIVACY.md` (write one; see template below)

---

## PRIVACY.md template

Save this at the root of the Helix repo, then link its blob URL as the privacy policy on the store listing:

```markdown
# Helix privacy policy

Last updated: 2026-07-18

Helix is a browser extension that measures your token usage on chatgpt.com and claude.ai and stores the counts locally in your browser. This policy describes exactly what data is collected, where it goes, and what your options are.

## Data we collect

For every chat message you send on chatgpt.com or claude.ai, Helix reads the outgoing request payload and the streamed response to compute:

  • A model identifier (e.g. "gpt-4o", "claude-5-sonnet")
  • The number of input tokens
  • The number of output tokens
  • The current USD cost based on our local pricing table
  • A timestamp

Nothing else. We do not store the content of your prompts, the content of the model's replies, your account identity, or any part of the pages you visit.

## Where the data goes

Nowhere. All of the above is written to `chrome.storage.local` — a per-browser sandbox that only Helix can read. No data leaves your browser.

## Network requests we make

Helix makes exactly one outbound network request: once every 24 hours we fetch a JSON file from `https://raw.githubusercontent.com/Swanand66/helix_price/main/prices.json` to keep our pricing table current. This is a plain HTTP GET; nothing about you or your usage is sent along with it.

## Deleting your data

Open the Helix toolbar popup and click "Reset" to wipe all stored events. Or open the browser DevTools on any tab and run:

    chrome.storage.local.clear()

Or uninstall the extension — Chrome removes its storage automatically.

## Contact

Open an issue at https://github.com/Swanand66/helix/issues.
```

---

## Post-submission checklist

- [ ] $5 developer registration fee paid at https://chrome.google.com/webstore/devconsole
- [ ] `dist/helix-v0.1.0.zip` uploaded
- [ ] All fields above filled in
- [ ] At least 1 screenshot uploaded (aim for 3)
- [ ] `PRIVACY.md` committed to the Helix GitHub repo and its blob URL pasted into the listing
- [ ] Support email filled in
- [ ] "Submit for review" clicked

Typical review turnaround for a well-documented single-purpose extension: **1–5 business days**. If rejected, the store gives specific reasons and you can revise + resubmit.
