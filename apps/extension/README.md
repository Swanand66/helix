# Helix — browser extension (v0.2)

Tracks token usage on **chatgpt.com** and **claude.ai**. Every message you send gets counted, priced, and stored — locally, in the browser. No accounts, no cloud, no network calls.

**New in v0.2:** the glowing ⌘ orb is injected directly into ChatGPT and Claude tabs, in the bottom-right corner. It sits quiet until you send a message — then it glows smoothly while the assistant is answering. Click it → panel opens showing today + this month totals.

## What it does

1. Intercepts the outbound `fetch` to each site's chat-completion endpoint
2. Reads the model id + your input from the request payload
3. Tees the streaming response so the page keeps working normally
4. Counts input tokens (from the payload) and output tokens (from the stream)
5. Multiplies by the model's per-token price
6. Stores a compact entry in `chrome.storage.local`
7. **In-page orb glows during streaming** and fades out ~1s after the response ends
8. Click the orb (or the toolbar icon) → panel shows today + this month, per-model breakdown

Approximation is used for token counting (~97% accuracy on English prose). Every stored entry is marked `approx: true`.

## How to load it (Chrome / Edge)

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select this folder: `apps/extension/`
5. Pin the "Helix — LLM token meter" icon to your toolbar

That's it. No `npm install`, no build step — this extension is plain vanilla MV3 with no build pipeline.

## Testing it works

1. Load the extension (steps above)
2. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai)
3. **Look at the bottom-right corner** — you should see the dim ⌘ symbol (Helix orb) sitting quietly
4. Open DevTools → **Console** — you should see: `[helix] page-hook installed`
5. **Send any message** in the chat
6. **Watch the orb** — the ⌘ should light up in cyan and the neon glow should flow smoothly around its strokes for as long as the assistant is streaming its answer, then fade out ~1s after it finishes
7. **Click the orb** — the panel opens showing today + this month token totals with per-model breakdown
8. Drag the orb anywhere on the page — it stays where you drop it
9. In the console, run `chrome.storage.local.get("helix.events").then(console.log)` to see the raw event log

## Daily price auto-refresh

The extension bundles a fallback price table (see `tokenize.js`), so it works out of the box. To keep prices fresh **without shipping a new extension version every time a provider changes a rate**, wire up a hosted `prices.json`:

### 1. Host `prices.json` publicly

Copy [`prices.json`](../../prices.json) from the repo root to a public HTTPS URL. Easiest options:

- **GitHub raw** — commit `prices.json` to a public repo, use `https://raw.githubusercontent.com/<user>/<repo>/main/prices.json`
- **GitHub Pages** — same but with a Pages URL
- **Cloudflare Pages / Netlify** — drag-and-drop static site
- **Gist** — for a single file

### 2. Point the extension at it

In [`background.js`](background.js), set:

```js
const PRICES_URL = "https://raw.githubusercontent.com/YOUR-USER/helix/main/prices.json";
```

Also add that host to `manifest.json`:

```json
"host_permissions": [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://raw.githubusercontent.com/*"
]
```

Reload the extension. On next install and every 24h (via `chrome.alarms`), the extension will fetch the URL, cache the JSON in `chrome.storage.local`, and merge it over the bundled fallback. If the fetch fails, it silently keeps using the cache (or the bundle).

### 3. Keep the file auto-updated (GitHub Action)

Create `.github/workflows/update-prices.yml` in your repo:

```yaml
name: Refresh prices
on:
  schedule: [{ cron: "0 6 * * *" }]  # 06:00 UTC daily
  workflow_dispatch:
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scrape providers and write prices.json
        run: node scripts/scrape-prices.mjs > prices.json.new
      - name: Commit if changed
        run: |
          if ! diff -q prices.json prices.json.new >/dev/null 2>&1; then
            mv prices.json.new prices.json
            git config user.name  "helix-bot"
            git config user.email "bot@helix.local"
            git add prices.json
            git commit -m "chore: refresh prices $(date -u +%Y-%m-%d)"
            git push
          else
            rm prices.json.new
          fi
```

`scripts/scrape-prices.mjs` is up to you — options range from **hitting each provider's public pricing page and parsing HTML** to **calling an LLM with the pricing page URL and asking for structured JSON**. Small script, tolerant to change.

Once set up, the loop is: provider updates their rate → GitHub Action detects it within 24h → commits new `prices.json` → next time each user's extension runs its 24h refresh, they get the new numbers automatically. Zero code changes, zero re-publishing.

### Verifying it works

In `chrome://extensions/` → Helix → click "service worker" → look for:

```
[helix bg] loaded cached prices (22 models)         ← from chrome.storage.local
[helix bg] refreshed prices from remote (22 models) ← if PRICES_URL is set + reachable
[helix bg] scheduled daily price refresh (every 24h)
```

## File map

```
apps/extension/
├── manifest.json     MV3 manifest — permissions, entry points, host matches
├── page-hook.js      injected into the page's main JS world (overrides fetch,
│                     emits HELIX_STREAM start/bump/end + HELIX_USAGE events)
├── content.js        isolated-world script: inject page-hook + relay HELIX_USAGE
├── orb-inject.js     mounts the glowing ⌘ orb into the page via Shadow DOM;
│                     listens for HELIX_STREAM to drive its glow
├── background.js     service worker: tokenize + store to chrome.storage.local
├── tokenize.js       shared approximator + inline price table + model normalizer
├── popup.html        toolbar popup UI (same data as the in-page orb panel)
├── popup.js          popup renderer — reads storage + shows today/month totals
└── README.md         this file
```

**~900 lines of code total.** Zero dependencies. Zero build step.

## What it does NOT do (yet)

- Send anything to a daemon or cloud (v0.2 will optionally push to a local `helix-orb` if it's running)
- Track ChatGPT Desktop / Claude Desktop / other apps
- Track browsers other than Chrome / Edge (Firefox in v0.2)
- Show a floating orb on your screen (that's a separate app in the plan)
- Use exact tokenization (that's v0.2 — either bundle `js-tiktoken` or offload to the orb daemon)

## Adapting to API changes

Both ChatGPT and Claude change their streaming payloads a few times a year. When something breaks:

- **ChatGPT:** update `CHATGPT_URL` regex and/or `extractDelta`/`extractInput` for `source === "chatgpt"` in [`page-hook.js`](page-hook.js). Usually a 3-line patch.
- **Claude:** same, for `source === "claude"`. Newer Claude events use `{ type: "content_block_delta", delta: { text: ... } }` — already handled.

Reload the extension after editing (Extensions page → Reload button under the extension card).

## Privacy

Every byte of data lives in your browser's local storage. No `fetch` to any server. No telemetry. No accounts. The extension's only permissions are `storage` and `host_permissions` for the two supported chat sites.

You can wipe everything at any time via the **Reset** button in the popup, or `chrome.storage.local.clear()` in the extension's service worker console.
