# Helix

**A live token + cost meter for ChatGPT and Claude.**
Install the browser extension, chat like normal, and see exactly how much every message is costing you. Local-only, no accounts, no cloud.

<p align="center">
  <img src="apps/extension/icons/icon-128.png" width="88" alt="Helix logo"/>
</p>

---

## What you get

- **A quiet ⌘ orb** in the bottom-right of chatgpt.com and claude.ai
- **Neon glow flows** around it while the assistant is streaming your reply
- **Click it** to see today's + this month's token usage broken down by model
- **Daily-refreshed pricing** — providers update rates, you get them within 24h with no re-install
- **Fully local** — no accounts, no telemetry, prompts never leave your browser

## Supported models (v0.1)

- **OpenAI**: gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o, gpt-4o-mini, gpt-4-turbo, o3, o3-mini, o4, o4-mini
- **Anthropic**: claude-5-opus, claude-5-sonnet, claude-5-haiku, claude-4.5-opus, claude-4.5-sonnet, claude-4.5-haiku
- **Google**: gemini-2.5-pro, gemini-2.5-flash

More arrive automatically via the [daily price refresh](https://github.com/Swanand66/helix_price).

## Install

### From source (developer install)

1. Clone this repo
2. Open `chrome://extensions/` in Chrome or Edge
3. Toggle **Developer mode** on (top-right)
4. Click **Load unpacked** → select the `apps/extension/` folder
5. Pin the Helix icon to your toolbar

### From Chrome Web Store

Coming soon — v0.1 packaged in [`dist/helix-v0.1.0.zip`](dist/helix-v0.1.0.zip), listing copy in [`CHROME_WEB_STORE_LISTING.md`](CHROME_WEB_STORE_LISTING.md).

## How it works (30-second version)

```
   Your chat on chatgpt.com or claude.ai
                ↓
   Extension's content script hooks window.fetch
                ↓
   Sees the completion request → reads model + input
   Tees the streaming response → counts tokens as they arrive
                ↓
   Multiplies token counts by current per-1M rates
                ↓
   Stores compact entry in chrome.storage.local
   Fires a smooth glow animation on the ⌘ orb
                ↓
   You click the orb → panel shows today + month totals
```

**Every step is local.** The only network call the extension makes is a once-per-24-hour GET to a public JSON file for updated pricing.

## Repo layout

```
Helix/
├── apps/
│   └── extension/           ← the browser extension (v0.1)
│       ├── manifest.json    MV3 manifest
│       ├── background.js    service worker: tokenize + store + daily prices
│       ├── content.js       isolated-world relay
│       ├── page-hook.js     main-world fetch override + SSE stream parser
│       ├── orb-inject.js    shadow-DOM in-page ⌘ orb + panel
│       ├── popup.html/js    toolbar popup
│       ├── tokenize.js      approximator + model normalizer + price math
│       └── icons/           16 / 48 / 128 PNGs
│
├── scripts/
│   ├── build-icons.mjs      regenerate icon PNGs from the ⌘ SVG
│   └── package.mjs          build the Chrome Web Store zip → dist/helix-vX.Y.Z.zip
│
├── prices.json              the source-of-truth pricing table (mirrored to
│                            Swanand66/helix_price for daily refresh)
│
├── dist/                    generated zips (git-ignored)
│
├── CHROME_WEB_STORE_LISTING.md    copy-paste kit for the store submission
├── PRIVACY.md                     privacy policy (linked from the store)
├── README.md                      you are here
└── LICENSE                        MIT
```

## Related repo

**[Swanand66/helix_price](https://github.com/Swanand66/helix_price)** — the daily-refreshable pricing table. A GitHub Action there scrapes LiteLLM's community-maintained pricing JSON once a day and commits diffs. The extension fetches this file to stay current without shipping new versions.

## Development

```bash
# Regenerate icons after editing scripts/build-icons.mjs
node scripts/build-icons.mjs

# Build the Chrome Web Store zip
node scripts/package.mjs
# → dist/helix-v0.1.0.zip

# Load-unpacked the apps/extension/ folder in chrome://extensions/
# and reload it after any code change.
```

## Roadmap

- [x] v0.1 — Extension for ChatGPT + Claude with in-page glowing ⌘ orb
- [x] v0.1 — Daily auto-refresh of pricing via GitHub Action
- [ ] v0.2 — Gemini + Perplexity + Copilot Chat support
- [ ] v0.3 — Optional Tauri desktop app for "always visible" outside the browser
- [ ] v1.0 — Budget alerts, per-project tags, exportable history

## Privacy

Nothing leaves your browser besides the daily price-file fetch. See [`PRIVACY.md`](PRIVACY.md) for details.

## License

MIT — see [`LICENSE`](LICENSE).
