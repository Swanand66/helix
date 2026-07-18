# Helix — Plan

`helix` is a multi-model LLM token counter and cost oracle for JavaScript/TypeScript.
Count tokens for GPT / Claude / Gemini / Llama / Mistral / DeepSeek. Estimate cost.
No API keys required. Works offline. ~8kB tree-shaken.

Ships as **three surfaces** built on one core:

1. **`helix-tokens`** — the library + CLI (weeks 1–3)
2. **`@helix-tokens/prices`** — auto-updated pricing data (week 1)
3. **`helix` desktop app** — global-hotkey popup (⌘⇧H / Ctrl+Shift+H) (week 4)

---

## 1. Problem

Every AI engineer answers *"how many tokens is this text across models, and what will it cost?"* 10–20 times per day.

Current options:
- `js-tiktoken` (3M weekly) — OpenAI-only, no cost
- `gpt-tokenizer` (80k weekly) — OpenAI-only
- `tokenlens` (15k weekly) — multi-provider + cost, but library-only, weak marketing, stale prices, no CLI, no popup
- Anthropic's `messages.count_tokens` endpoint — needs an API key, network round-trip

**No package combines: multi-provider + live prices + killer CLI + tree-shakable + zero-key offline mode + desktop popup.**

That's the wedge.

## 2. Positioning

> **"Count tokens and estimate cost for every LLM. No API keys. Works offline. Always current."**

Four sharp claims. Every marketing surface leads with the same four.

## 3. Product surfaces

### 3.1 Library (`helix-tokens`)

```ts
import { count, cost, estimate, budget, compare } from "helix-tokens";

count("hello world")
// { "gpt-4o": 2, "claude-4.5-sonnet": 2, "gemini-2.5-pro": 3, ... }

count("hello world", "gpt-4o")  // → 2

cost("hello world", "gpt-4o")
// { tokens: 2, usd: 0.000005, model: "gpt-4o", approx: false }

estimate({ input: "...", maxOutput: 500, model: "claude-4.5-sonnet", n: 10_000 })
// { perRequest: {...}, batch: { totalTokens, usd, wallTime }, alternatives: [...] }

budget("...", { max: 0.01, model: "gpt-4o" })
// { fits: true, spent: 0.003, remaining: 0.007 }

compare("...", ["gpt-4o", "claude-4.5-sonnet", "gemini-2.5-pro"])
// [{ model, tokens, usd, rank }, ...]
```

**Design rules**
- All functions sync by default (tokenizers are local WASM/JS, prices are a static import)
- Tree-shakable — importing `count` shouldn't pull in the Claude tokenizer if you only use GPT
- Zero deps in the core beyond the tokenizer libraries
- Total install < 50 kB gzipped for a single-provider consumer
- Works in Node, Bun, Deno, edge runtimes, browsers

### 3.2 CLI (`helix-tokens` bin)

```bash
helix-tokens "explain quantum tunneling"       # default: all models table
helix-tokens --file prompt.md
cat prompt.md | helix-tokens                   # stdin
helix-tokens compare "..." --models gpt-4o,claude-4.5-sonnet
helix-tokens cost gpt-4o --n 10000 --in 800 --out 400
helix-tokens budget "..." --model gpt-4o --max 0.01
helix-tokens prices                            # current rate card
helix-tokens prices --diff                     # what changed since yesterday
helix-tokens "..." --json                      # machine-readable
```

**Output design** — cheapest row on top, `~` on approximated counts, one-line summary
at the bottom, colors only when TTY is attached, respects `NO_COLOR`.

### 3.3 Desktop popup (`helix` app)

- Global hotkey: `⌘⇧H` (mac) / `Ctrl+Shift+H` (win/linux)
- 480×320px frameless popup, backdrop blur, center screen on open
- Type/paste prompt → live count across configured models (150ms debounce)
- `⏎` copies cheapest model name + count; `⌘C` copies full JSON; `esc` closes
- `⌘B` toggles batch-cost mode (input `n` requests, `out` tokens, see total $)
- Settings pane behind `⌘,` — models to show, budget alert, hotkey rebind, optional
  Anthropic/Gemini keys for exact counts
- Menu-bar / tray icon shows clipboard token count at rest
- Auto-update via Tauri updater + GitHub Releases

## 4. Coverage — day-1 model matrix

| Provider | Models | Tokenizer | Exact? |
|---|---|---|---|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, o3, o3-mini | `js-tiktoken` (o200k_base, cl100k_base) | ✅ 100% |
| Anthropic | claude-4.5-opus, claude-4.5-sonnet, claude-4.5-haiku | Local BPE approximator | ~97% (opt-in exact via free `count_tokens` API) |
| Google | gemini-2.5-pro, gemini-2.5-flash | Local SentencePiece approximator | ~97% (opt-in exact via free key) |
| Meta | llama-3.3-70b, llama-3.3-8b | Public SentencePiece | ✅ 100% |
| Mistral | mistral-large, mistral-small | Public SentencePiece | ✅ 100% |
| DeepSeek | deepseek-v3 | Public BPE | ✅ 100% |

Add more via community PR — every added model is a growth event.

## 5. Repo structure

```
helix/
├── plan.md                        # (this file)
├── README.md
├── package.json                   # root, workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
│
├── packages/
│   ├── core/                      # helix-tokens
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── count.ts
│   │   │   ├── cost.ts
│   │   │   ├── estimate.ts
│   │   │   ├── budget.ts
│   │   │   ├── compare.ts
│   │   │   ├── types.ts
│   │   │   └── tokenizers/
│   │   │       ├── openai.ts
│   │   │       ├── anthropic.ts
│   │   │       ├── gemini.ts
│   │   │       ├── llama.ts
│   │   │       ├── mistral.ts
│   │   │       └── deepseek.ts
│   │   └── test/
│   │
│   └── prices/                    # @helix-tokens/prices
│       ├── package.json
│       ├── src/index.ts
│       └── data/prices.json
│
├── apps/
│   ├── cli/                       # helix-tokens (bin)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── commands/
│   │       │   ├── tokens.ts
│   │       │   ├── cost.ts
│   │       │   ├── compare.ts
│   │       │   ├── budget.ts
│   │       │   └── prices.ts
│   │       └── ui/
│   │           ├── table.ts
│   │           └── colors.ts
│   │
│   └── desktop/                   # Tauri app (week 4+)
│       └── (scaffold later)
│
└── .github/
    └── workflows/
        ├── update-prices.yml      # cron 3x/day → PR on price diff
        ├── release-cli.yml        # tag → publish npm
        └── release-desktop.yml    # tag → signed Mac/Win/Linux
```

## 6. Data — pricing schema

`packages/prices/data/prices.json`:

```json
{
  "version": "2026.07.18",
  "updated": "2026-07-18T12:00:00Z",
  "models": {
    "gpt-4o": {
      "provider": "openai",
      "context": 200000,
      "input":  2.50,
      "output": 10.00,
      "cachedInput": 1.25
    },
    "claude-4.5-sonnet": {
      "provider": "anthropic",
      "context": 200000,
      "input":  3.00,
      "output": 15.00,
      "cachedInput": 0.30
    }
  }
}
```

All prices are USD per **1M tokens**. Consumer math: `cost = tokens / 1_000_000 * priceUsd`.

`update-prices.yml` cron job runs 3x/day: scrapes each provider's pricing page → diffs
against yesterday → auto-PR on change → auto-publish `@helix-tokens/prices` on merge.

## 7. Tokenizer strategy

- **OpenAI** — wrap `js-tiktoken` (100% exact, small, tree-shakable). Auto-map model → encoding.
- **Anthropic** — bundle a BPE approximator seeded from published Claude 3 tokenizer;
  document that it's ~97% accurate. Opt-in exact via `count(text, "claude-...", { exact: true, apiKey })` that calls Anthropic's free `messages.count_tokens` endpoint.
- **Google Gemini** — local SentencePiece approximator; same opt-in exact mode via free
  Gemini API key.
- **Llama / Mistral** — official SentencePiece BPE vocabularies bundled as JSON.
- **DeepSeek** — BPE vocabulary bundled.

Every non-exact result carries `approx: true` in the return type. The CLI renders `~`
next to the token count. **Never hide the truth.**

## 8. Ship plan

### Week 1 — Core + prices seed
- [ ] Repo scaffold (pnpm monorepo, tsup, changesets, vitest)
- [ ] `packages/prices` with hand-seeded `prices.json` (10 launch models)
- [ ] `packages/core/src/count.ts` + `cost.ts` for OpenAI + Anthropic
- [ ] `estimate()` batch math with `wallTime` heuristic
- [ ] Vitest suite: known strings → known token counts (cross-check vs provider APIs)
- [ ] README with 3 killer snippets
- [ ] Publish `helix-tokens@0.1.0` + `@helix-tokens/prices@2026.7.18`

### Week 2 — CLI + more tokenizers + price scraper
- [ ] `apps/cli` with `tokens`, `cost`, `compare`, `budget`, `prices` commands
- [ ] Add Gemini, Llama, Mistral, DeepSeek tokenizers
- [ ] GitHub Action: scrape prices, PR on diff, auto-publish
- [ ] Landing page (Astro, single-page, terminal GIF demos)
- [ ] Publish `v0.2.0`

### Week 3 — Polish + launch
- [ ] Streaming API `stream(input, model)` for real-time cost as bytes arrive
- [ ] Bundle-size CI check (fail if core > 50 kB gzipped)
- [ ] Edge-runtime test (Cloudflare Workers, Vercel Edge, Deno Deploy)
- [ ] Publish `v1.0.0`
- [ ] Launch: HN + X thread + dev.to post

### Week 4 — Desktop popup
- [ ] Tauri 2 scaffold with Preact + Tailwind + shadow-DOM
- [ ] `⌘⇧H` global hotkey → toggle popup
- [ ] Live counting UI (empty / counting / batch / over-budget / price-alert states)
- [ ] Settings pane (models, budget, hotkey rebind, optional API keys)
- [ ] Signed Mac + Win + Linux builds via GitHub Releases
- [ ] Product Hunt launch (7-sec screen recording as hero video)

## 9. Non-goals for v1

- Web dashboard / hosted service
- Cost tracking / persistence (different tool)
- Semantic prompt diff (that's `helix-diff`, separate)
- JSON repair (`jsonrepair` wins that fight — 1.56M weekly)
- Structured output retry (Vercel AI SDK wins — 2.8M weekly)
- Multi-model prompt runner (`promptfoo` wins — OpenAI acquired March 2026)
- Unified LLM fallback (Vercel AI SDK + Gateway wins)

Stay ruthless. **One package, one job, done better than anyone.**

## 10. Success metrics

| Metric | Month 1 | Month 3 | Month 6 |
|---|---|---|---|
| Weekly npm downloads | 2,000 | 25,000 | 100,000+ |
| GitHub stars | 500 | 3,000 | 8,000 |
| Contributors | 5 | 20 | 50 |
| Model coverage | 15 | 30 | 50 |
| Desktop app installs | — | 5,000 | 25,000 |

At 100k weekly downloads, `helix-tokens` surpasses `tokenlens` (~15k) and
`gpt-tokenizer` (~80k), becoming the default multi-provider counter in npm.

## 11. Tech stack

| Piece | Choice |
|---|---|
| Language | TypeScript (strict) |
| Package manager | pnpm (workspaces) |
| Bundler | tsup (esbuild-backed, ESM + CJS + .d.ts) |
| Tests | vitest |
| Linter | biome (fast, one-tool) |
| Release | changesets |
| CLI framework | citty or plain minimist (small, fast) |
| CLI rendering | cli-table3 + kleur |
| Desktop shell | Tauri 2 (Rust) |
| Desktop UI | Preact + Tailwind |
| Site | Astro (single-page, GIF-heavy) |
| Hosting | Cloudflare Pages (free) |

## 12. Risk register

| Risk | Mitigation |
|---|---|
| Anthropic releases official tokenizer | Swap approximator for exact — same API, no breaking change |
| Vercel AI SDK ships `count()` for all providers | Compete on: no framework lock-in, CLI, desktop popup, price freshness |
| Provider pricing pages change format (scraper breaks) | Manual PR fallback; test suite fails loudly; community PRs welcome |
| Tokenizer WASM size bloat | Lazy-load per provider; tree-shaking; measure in CI |
| `tokenlens` catches up | Ship the CLI and popup — they haven't and probably won't |

## 13. Open questions

- Should the CLI be `helix` or `helix-tokens`? — Using `helix-tokens` for clarity;
  reserve `helix` for the desktop app / meta-brand.
- License? — MIT.
- Fund development? — Ship OSS, add a "sponsor to prioritize your provider" tier
  on GitHub Sponsors after month 3.

---

**Start here:** Week 1, day 1 — this document, root scaffold, `packages/prices` seed
data, `packages/core` with OpenAI + Anthropic count/cost, working `helix-tokens "hello"`
CLI output. That's today's target.
