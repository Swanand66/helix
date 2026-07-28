# Helix on the desktop — plan

Extending Helix beyond browser tabs to cover **native desktop apps** and **CLIs** that talk to LLMs. The v0.4.x extension only sees traffic that happens inside a browser tab. This document maps out how we cover everything else.

---

## 1. What "desktop support" needs to cover

The universe of desktop LLM clients, roughly ranked by how much people use them in 2026:

| Client | Runs where | Talks to | Currently tracked? |
|---|---|---|---|
| **Claude Desktop** (Anthropic) | macOS / Windows | Anthropic API | ❌ |
| **ChatGPT Desktop** (OpenAI) | macOS / Windows | OpenAI API | ❌ |
| **Cursor** | macOS / Windows / Linux | Cursor's proxy → multiple providers | ❌ |
| **VS Code + Copilot Chat** | Everywhere | GitHub proxy → OpenAI | ❌ |
| **Claude Code CLI** | Terminal (all OSes) | Anthropic API | ❌ |
| **Codex CLI** / **Aider** / **Continue** / etc. | Terminal | User's chosen provider | ❌ |
| **Ollama** | Local machine | Local (nothing to track — no cost) | ✅ nothing to track |
| **Custom scripts** (Python, Node) using OpenAI/Anthropic SDKs | Everywhere | Provider APIs | ❌ |

**Two categories:**

- **Open** — respects `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` env vars or has a UI setting for custom endpoint. Includes every CLI, every SDK, VS Code with configurable base URL, Aider, Continue, LiteLLM, etc.
- **Closed** — hard-codes the provider URL into the binary. Claude Desktop, ChatGPT Desktop, Cursor's proxy, GitHub Copilot Chat.

Different techniques work for each.

---

## 2. Why the current extension can't do it

The browser extension hooks `window.fetch` and `XMLHttpRequest` inside chatgpt.com / claude.ai / gemini.google.com tabs. Those are JavaScript-runtime hooks. They exist inside a Chrome process.

Desktop apps run in their own OS processes with their own network stacks (curl, libcurl, Rust's reqwest, Go's net/http, Node's undici). Nothing about the browser extension can see them.

---

## 3. Approach map

Every approach comes with a real trade-off. Here they are ranked by user friction (lowest → highest):

| Approach | User friction | Covers open apps? | Covers closed apps? | Requires TLS interception? | Notes |
|---|---|---|---|---|---|
| **A. env-var-based local proxy** | Low (paste 2 lines into shell config) | ✅ | ❌ | ❌ | The "80% of value for 20% of effort" path |
| **B. Native menu bar app + local proxy** | Low (install app, set env vars once) | ✅ | ❌ | ❌ | Same as A but with a nice UI + persistent daemon |
| **C. Per-app plugin** (VS Code ext, Raycast plugin, etc.) | Low per plugin (install from marketplace) | ✅ (per plugin) | ✅ where plugin exists | ❌ | Best UX for supported apps; work multiplies per app |
| **D. LiteLLM / OpenRouter integration** | Medium (user routes calls through a gateway) | ✅ | ❌ | ❌ | Piggyback on tools users already have |
| **E. macOS Network Extension** / Windows WFP filter | High (install signed system extension, grant permission) | ✅ | ✅ | ✅ (would need to install root cert) | Full coverage but heavy install + security ask |
| **F. mitmproxy in "transparent" mode** | Very high (install root cert, configure routing) | ✅ | ✅ | ✅ | Power-user only; not shippable to general audience |

**Recommendation:** ship A → B → C in that order. Skip D–F for v1; revisit if there's demand.

---

## 4. Recommended architecture (staged rollout)

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Helix Desktop (Tauri menu-bar app, macOS + Windows)                 │
   │  ─────────────────────────────────────────────────────────           │
   │  • Runs a local proxy on 127.0.0.1:31415                            │
   │  • Shows the same ⌘ orb from the browser extension, but native      │
   │  • Owns a shared events log at ~/.helix/events.jsonl                │
   └─────────────────┬─────────────────────────────────────────┬──────────┘
                     │                                         │
                     ▼                                         ▼
   ┌──────────────────────────────────┐    ┌──────────────────────────────────┐
   │  Local proxy on 127.0.0.1:31415  │    │  Chrome / Edge extension         │
   │  ─────────────────────────────   │    │  (existing v0.4.x)               │
   │  Accepts requests shaped like    │    │  Reads/writes the SAME events    │
   │  the OpenAI + Anthropic APIs,    │    │  log via a WebSocket bridge      │
   │  logs (model, in tokens, out     │    │  to the desktop app              │
   │  tokens), forwards to the real   │    │                                  │
   │  provider, streams response back │    │  Falls back to chrome.storage    │
   │  unchanged.                      │    │  if desktop app not running      │
   └──────────────────────────────────┘    └──────────────────────────────────┘
              ▲                                          ▲
              │ HTTPS                                    │ page tabs
              │                                          │
   ┌──────────┴────────────────┐          ┌──────────────┴─────────────────┐
   │  Any CLI / script / IDE   │          │  chatgpt.com / claude.ai /     │
   │  that respects            │          │  gemini.google.com             │
   │  OPENAI_BASE_URL or       │          │                                │
   │  ANTHROPIC_BASE_URL       │          │                                │
   │                           │          │                                │
   │  User pasted 2 lines into │          │  Extension does its thing      │
   │  their .zshrc:            │          │                                │
   │    OPENAI_BASE_URL=       │          │                                │
   │      http://127.0.0.1:    │          │                                │
   │      31415/openai         │          │                                │
   │    ANTHROPIC_BASE_URL=    │          │                                │
   │      http://127.0.0.1:    │          │                                │
   │      31415/anthropic      │          │                                │
   └───────────────────────────┘          └────────────────────────────────┘
```

Single event log, two capture surfaces, one unified UI (in the panel and popup).

---

## 5. Phase 1 — Env-var-based local proxy (the MVP)

**Goal:** track token usage from every CLI, script, or IDE that uses the OpenAI or Anthropic SDKs.

**How:** ship a small local proxy the user runs in the background. They set two env vars in their shell profile. Everything routed through it, we count tokens, we forward to the real API unchanged, we return the response unchanged.

### What ships
1. A single-binary CLI: `helix-proxy` (~5 MB, Node or Rust or Go — whichever is easiest to sign)
2. Instructions to add two lines to `.zshrc` / `.bashrc` / PowerShell profile
3. The proxy writes events to `~/.helix/events.jsonl` — same format as browser extension

### Endpoints the proxy exposes
- `POST http://127.0.0.1:31415/openai/v1/chat/completions` → proxies to `https://api.openai.com/v1/chat/completions`
- `POST http://127.0.0.1:31415/openai/v1/embeddings` → proxies to `https://api.openai.com/v1/embeddings`
- `POST http://127.0.0.1:31415/anthropic/v1/messages` → proxies to `https://api.anthropic.com/v1/messages`
- (More as we add providers.)

The user's Authorization header is passed through untouched. **We never touch API keys.**

### Token measurement
- **Non-streaming** — read request body, count input tokens; read response, extract `usage.prompt_tokens` + `usage.completion_tokens` from the standard `usage` field both providers return
- **Streaming** — tee the response stream, count deltas as they arrive, get the final `usage` from the terminal event
- Both providers now include exact token counts in their responses so we don't have to approximate

### What users type once
```bash
# ~/.zshrc  (or ~/.bashrc, or PowerShell $PROFILE)
export OPENAI_BASE_URL="http://127.0.0.1:31415/openai"
export ANTHROPIC_BASE_URL="http://127.0.0.1:31415/anthropic"
```

That's it. From that moment on, any CLI, any Python script, any Node script, any IDE that respects those env vars starts being tracked. **Claude Code, Codex CLI, Aider, Continue, LangChain scripts — all covered.**

### What Phase 1 does NOT cover
- Claude Desktop app (hard-coded endpoint)
- ChatGPT Desktop app (hard-coded endpoint)
- Cursor (its own proxy)
- GitHub Copilot Chat (goes through a GitHub proxy)

Those need Phase 3.

### Effort estimate
- Proxy binary: 2 days (a few hundred lines of Node HTTP forwarder)
- Cross-platform signed builds: 1 day per OS
- Auto-start on login / systemd unit: 1 day
- Documentation + one-command install script: 1 day

**Total: 1 week end-to-end.**

---

## 6. Phase 2 — Native Helix Desktop app (Tauri menu bar)

**Goal:** turn the proxy into a real product with a UI. Ship an on-screen orb natively on the desktop, not confined to a browser tab.

### What ships
- **Tauri** app (Rust + WebView2 or WebKit) that:
  - Runs the proxy from Phase 1 as an embedded background service
  - Shows the same ⌘ orb as a system menu bar / tray icon
  - Native panel window (click orb → opens same layout as browser popup)
  - Reads `~/.helix/events.jsonl` for the source of truth
- **Cross-signed installers**: `.dmg` for macOS, `.msi` for Windows, `.deb` + `.rpm` for Linux
- Auto-start on login, auto-update via Sparkle (macOS) / built-in Tauri updater (all OSes)

### Why Tauri (not Electron)
- ~10 MB final binary vs 150 MB for Electron
- Uses the OS's native WebView, not bundled Chromium
- Rust core → good story for the proxy
- Existing browser extension's UI (orb, panel) is HTML + CSS + vanilla JS — ports 1:1 into the Tauri WebView

### Bridge to browser extension
- Desktop app exposes a WebSocket on `127.0.0.1:31416`
- Browser extension detects it on startup:
  - If desktop app is running → send events via WebSocket, hide the browser's in-page orb (the desktop orb is the unified view)
  - If not running → fall back to `chrome.storage.local` and show the in-page orb
- **The two never fight for the display.**

### Shared event schema
Same JSON shape both surfaces write. The desktop app owns `~/.helix/events.jsonl`, the extension writes to it via the WebSocket bridge (or falls back to chrome.storage in isolation).

### Effort estimate
- Tauri scaffold + menu bar orb: 3 days
- Panel window (port HTML/CSS from browser extension): 2 days
- WebSocket bridge + event log format: 2 days
- Auto-update + signing (Apple Developer $99/yr + Windows EV cert ~$300/yr): 3 days
- Cross-OS testing: 2 days

**Total: ~2 weeks after Phase 1.**

---

## 7. Phase 3 — Per-app plugins (for closed apps)

**Goal:** cover the apps that don't respect env vars.

For each target app, ship a dedicated integration. This is per-app work, not a general solution.

### Priority order
1. **VS Code extension** — publishes to VS Code Marketplace. Hooks into Copilot Chat's own API surface (they expose a metrics event). ~1 week.
2. **Raycast extension** — for macOS power users. Shows today's cost as a menu bar item; deep-links to the desktop app. ~2 days.
3. **JetBrains plugin** — for IntelliJ/PyCharm/etc. users. Similar to VS Code. ~1 week.
4. **Cursor** — as of 2026 Cursor exposes a `~/.cursor/logs/` folder with usage data. We can watch it. ~3 days.
5. **Claude Code CLI** — Anthropic's CLI writes to `~/.claude/logs/`. Same file-watch pattern. ~2 days.

### What we ship for each
- Marketplace listing or brew formula
- Reads the app's own usage logs / hooks the app's API surface
- Writes into the shared `~/.helix/events.jsonl`

### What this does NOT cover
- **Claude Desktop app** — Anthropic doesn't expose usage from the app; no plugin API
- **ChatGPT Desktop app** — same story
- Those two need Phase 4 or reverse engineering. Realistic for a v2 push.

---

## 8. Phase 4 — Optional MITM proxy (advanced / opt-in)

**Goal:** cover Claude Desktop, ChatGPT Desktop, Cursor's proxy — the hard cases.

This is TLS interception. It's real work AND real user-trust work.

### How it works
1. Helix Desktop generates a local root CA on first install
2. User is prompted: **"Do you want to enable app-level tracking? This installs a local certificate that lets Helix see traffic from apps like Claude Desktop and ChatGPT Desktop. Only Helix (running locally) can decrypt the traffic. No data leaves your machine."**
3. If user opts in: install the cert to the system keychain, configure system HTTP proxy to route through Helix on `127.0.0.1:31415`
4. Now every HTTPS request from every app on the machine is decryptable by Helix; we log the ones we recognize and pass everything through unchanged

### The problems
- **Trust ask is real.** Users need to understand what they're agreeing to. Legit tools like Proxyman and Charles Proxy do this too, but they're for developers who understand what MITM means.
- **Some apps use certificate pinning.** Signal, some banking apps refuse traffic through a MITM even with a trusted cert. Claude Desktop / ChatGPT Desktop don't pin (checked as of 2026-05) but this could change.
- **Signing and notarization** get much stricter — Apple will scrutinize a Network Extension.

### When to actually build this
Only if there's real demand. Ship Phase 1–3 first, see if users are asking for the desktop-app coverage before taking on the trust + engineering cost.

**Effort: 3–4 weeks including notarization headaches.**

---

## 9. Effort roll-up

| Phase | What | Effort | Cumulative |
|---|---|---|---|
| 1 | Env-var proxy | 1 week | 1 week |
| 2 | Tauri menu bar app | 2 weeks | 3 weeks |
| 3 | Per-app plugins (top 3) | 3 weeks | 6 weeks |
| 4 | MITM (optional) | 4 weeks | 10 weeks |

Phase 1 alone unlocks all CLIs and configurable IDEs — probably 70% of technical users' AI spend.

Add Phase 2 and you have a shippable native product with a unified dashboard.

Add Phase 3 targeting VS Code + Cursor and you cover the coding workflow end-to-end.

Phase 4 is "nice to have," not table stakes.

---

## 10. Risks + honest limits

- **Proxy latency.** The v1 proxy adds maybe 1–3 ms per request on localhost. Immaterial for a 10-second chat completion. Worth measuring.
- **Streaming has edge cases.** OpenAI's `usage` in the terminal event isn't always present depending on model; may need to fall back to our approximator for those (~97% accurate, same as extension).
- **Auth headers.** We pass through `Authorization` untouched. If we ever cache or log it we've violated user trust. Explicit test in CI that no header is written to the event log.
- **Firewalls / antivirus.** Windows Defender occasionally flags any local proxy as suspicious. Signed installer + a plain-language description in the manifest usually clears this.
- **Cross-platform builds.** Every OS has its own signing story. Budget 1–2 days per OS for the first release, then it's mostly automated.
- **Users who don't use env vars** (Windows users who click on shortcuts, macOS users who launch apps from Dock) — the env var may not be inherited. Need to set it via `launchctl setenv` on macOS or `setx` on Windows, and document that.
- **Enterprise proxies.** Users behind a corporate MITM already have `HTTPS_PROXY` set. Our proxy needs to be aware and chain to the corporate proxy for outbound. ~1 day of work.
- **Model / cost drift.** Same as extension — the `helix_price` daily-refresh flow already handles this. Desktop reads the same `prices.json`.

---

## 11. Data model — shared across surfaces

Same JSON shape the browser extension already writes. Both surfaces read the same log.

Location: `~/.helix/events.jsonl` (JSON per line, append-only).

Schema (already implemented in browser extension):
```json
{
  "ts": 1721312400000,
  "source": "chatgpt-desktop",
  "model": "gpt-5",
  "rawModel": "gpt-5-2026-06",
  "provider": "openai",
  "inTokens": 342,
  "outTokens": 1240,
  "inCost": 0.000855,
  "outCost": 0.014880,
  "totalCost": 0.015735,
  "co2g": 0.5,
  "unpriced": false,
  "approx": false,
  "surface": "desktop-proxy"
}
```

New field `surface` distinguishes `browser-extension` vs `desktop-proxy` vs `vscode-plugin` etc. Panel can filter by surface if user wants ("show me only what I did in the terminal today").

---

## 12. Concrete next steps

1. **Decide** whether to build Phase 1 as its own package (`helix-proxy` on npm/homebrew) or bundle it into a Tauri app from day one.
2. **Write the proxy** as a Node HTTP server that forwards OpenAI + Anthropic requests, extracts usage from responses, writes to `~/.helix/events.jsonl`. ~300 lines. This is the load-bearing piece.
3. **Publish** `helix-proxy` to npm so users can `npx helix-proxy` immediately.
4. **Wire the browser extension** to prefer the local file log if it detects the desktop app is running (Phase 2 preview).
5. **Ship Phase 1** as an open beta. Iterate on real usage.
6. **Only then** invest in the Tauri app + per-app plugins.

The proxy is the wedge. Once it works, everything else composes.

---

## 13. What Phase 1 gives you today

If you build only Phase 1, you get:

- **Tracking for Claude Code CLI** (env vars work)
- **Tracking for OpenAI Codex CLI** (env vars work)
- **Tracking for every Python script** using `openai` or `anthropic` SDKs
- **Tracking for Aider, Continue, LangChain scripts**
- **Tracking for VS Code with Cline / Continue / RooCode extensions** that respect env vars
- **Tracking for any Docker container** you run with `-e OPENAI_BASE_URL=...`

That is meaningfully more than what the browser extension covers, at 1 week of work.

That is why Phase 1 is the wedge and everything else can wait until it earns its ticket.
