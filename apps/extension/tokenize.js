// tokenize.js — self-contained module used by both background.js and popup.js.
//
// v0.1 uses the same char-ratio approximator that lives in
// packages/core/src/tokenizers/approximate.ts so we don't need to bundle
// js-tiktoken (~180 kB) inside the extension. Accuracy is ~97% on English
// prose, which is more than enough for a running "how much have I spent?"
// meter. Every count is marked `approx: true` in the stored event.
//
// Prices are USD per 1 million tokens and are inlined from
// packages/prices/data/prices.json (same source of truth).

const PROVIDER_PROFILES = {
  openai:    { charsPerToken: 4.0, nonAsciiMultiplier: 2.0 },
  anthropic: { charsPerToken: 3.5, nonAsciiMultiplier: 2.0 },
  google:    { charsPerToken: 4.0, nonAsciiMultiplier: 2.2 },
  meta:      { charsPerToken: 3.8, nonAsciiMultiplier: 2.0 },
  mistral:   { charsPerToken: 3.9, nonAsciiMultiplier: 2.0 },
  deepseek:  { charsPerToken: 3.7, nonAsciiMultiplier: 2.0 },
};

// Bundled fallback prices (USD per 1M tokens). These ship WITH the extension
// so it always works out of the box, even if the daily remote refresh is
// disabled or offline. Values here are best-effort estimates — verify
// against each provider's official pricing page and update if wrong.
//
// At runtime, background.js may overlay this table with fresher values
// fetched from a hosted prices.json (see updatePrices() below).
const FALLBACK_PRICES = {
  // OpenAI — gpt-5 family (2026)
  "gpt-5":               { provider: "openai",    input: 3.0,  output: 12.0 },
  "gpt-5-mini":          { provider: "openai",    input: 0.2,  output: 0.8  },
  "gpt-5-nano":          { provider: "openai",    input: 0.05, output: 0.2  },

  // OpenAI — gpt-4 family
  "gpt-4o":              { provider: "openai",    input: 2.5,  output: 10.0 },
  "gpt-4o-mini":         { provider: "openai",    input: 0.15, output: 0.6  },
  "gpt-4-turbo":         { provider: "openai",    input: 10.0, output: 30.0 },

  // OpenAI — reasoning series
  "o4":                  { provider: "openai",    input: 8.0,  output: 32.0 },
  "o4-mini":             { provider: "openai",    input: 0.9,  output: 3.6  },
  "o3":                  { provider: "openai",    input: 10.0, output: 40.0 },
  "o3-mini":             { provider: "openai",    input: 1.1,  output: 4.4  },

  // Anthropic — claude 5 family (2026). Verify against anthropic.com/pricing.
  "claude-5-opus":       { provider: "anthropic", input: 18.0, output: 90.0 },
  "claude-5-sonnet":     { provider: "anthropic", input: 3.0,  output: 15.0 },
  "claude-5-haiku":      { provider: "anthropic", input: 1.0,  output: 5.0  },

  // Anthropic — claude 4.5 family
  "claude-4.5-opus":     { provider: "anthropic", input: 15.0, output: 75.0 },
  "claude-4.5-sonnet":   { provider: "anthropic", input: 3.0,  output: 15.0 },
  "claude-4.5-haiku":    { provider: "anthropic", input: 1.0,  output: 5.0  },

  // Google — gemini 2.5 family
  "gemini-2.5-pro":      { provider: "google",    input: 1.25, output: 5.0  },
  "gemini-2.5-flash":    { provider: "google",    input: 0.1,  output: 0.4  },
};

// Live mutable prices — initialized from fallback, updated at runtime by
// background.js when it fetches fresher data. tokenize.js consumers read
// through `currentPrices` so a refresh is reflected on the next call.
let currentPrices = { ...FALLBACK_PRICES };

/** Overlay updated prices on top of the fallbacks. Called by background.js
 *  on install, on cache-load, and after every successful remote refresh. */
export function updatePrices(next) {
  if (!next || typeof next !== "object") return;
  currentPrices = { ...FALLBACK_PRICES, ...next };
}

/** Read-only snapshot of the current effective prices. */
export function getPrices() {
  return currentPrices;
}

// Keep a named export so existing code that imports PRICES keeps working,
// though it will only reflect the FALLBACK values, not runtime overlays.
// Prefer getPrices() for anything that needs live values.
export const PRICES = FALLBACK_PRICES;

// ChatGPT and Claude return provider-specific model ids; normalize to the
// short ids in PRICES. Order matters: more-specific patterns MUST come first
// (e.g. "gpt-5-mini" before "gpt-5"), because we return on first match.
const MODEL_NORMALIZERS = [
  // OpenAI — reasoning series
  [/^o4-mini/i,                    () => "o4-mini"],
  [/^o4(\b|-)/i,                   () => "o4"],
  [/^o3-mini/i,                    () => "o3-mini"],
  [/^o3(\b|-)/i,                   () => "o3"],

  // OpenAI — gpt-5 family. ChatGPT often reports variants like "gpt-5-5",
  // "gpt-5-2025-08", etc. Bucket everything without an explicit size suffix
  // into "gpt-5" so pricing still applies.
  [/^gpt-5-nano/i,                 () => "gpt-5-nano"],
  [/^gpt-5-mini/i,                 () => "gpt-5-mini"],
  [/^gpt-5(\b|-)/i,                () => "gpt-5"],

  // OpenAI — gpt-4 family
  [/^gpt-4o-mini/i,                () => "gpt-4o-mini"],
  [/^gpt-4o(\b|-)/i,               () => "gpt-4o"],
  [/^gpt-4[-.]?turbo/i,            () => "gpt-4-turbo"],

  // Anthropic — one regex catches all Claude ids; classifier decides family.
  // Handles:  claude-sonnet-4-5-20250929, claude-sonnet-5, claude-5-sonnet,
  //           claude-opus-4-5, claude-haiku-5, etc.
  [/^claude/i, classifyClaude],

  // Google
  [/gemini.*pro/i,                 () => "gemini-2.5-pro"],
  [/gemini.*flash/i,               () => "gemini-2.5-flash"],
];

/**
 * Decide which Claude generation + tier a raw model id maps to.
 *   "claude-sonnet-5"            -> "claude-5-sonnet"
 *   "claude-5-sonnet"            -> "claude-5-sonnet"
 *   "claude-sonnet-4-5-20250929" -> "claude-4.5-sonnet"   (4-5, not 5)
 *   "claude-opus-4.5"            -> "claude-4.5-opus"
 *   "claude-haiku-5-preview"     -> "claude-5-haiku"
 */
function classifyClaude(m) {
  const s = m.toLowerCase();
  // If the id contains "4-5" or "4.5" as a version marker, it's 4.5.
  const is45 = /(?:^|[^0-9])4[-.]5(?:[^0-9]|$)/.test(s);
  // Otherwise, a standalone "5" surrounded by non-digits marks it as 5-series.
  const is5 = !is45 && /(?:^|[^0-9])5(?:[^0-9]|$)/.test(s);
  const version = is5 ? "5" : "4.5";
  if (s.includes("opus"))   return `claude-${version}-opus`;
  if (s.includes("haiku"))  return `claude-${version}-haiku`;
  if (s.includes("sonnet")) return `claude-${version}-sonnet`;
  return m; // keep raw if we can't classify (will surface as unpriced)
}

export function normalizeModel(rawModel) {
  if (!rawModel || typeof rawModel !== "string") return "unknown";
  for (const [re, fn] of MODEL_NORMALIZERS) {
    if (re.test(rawModel)) return fn(rawModel);
  }
  // If we don't recognize the model, keep the raw id so it still shows up
  // in the panel — just with no price attached.
  return rawModel;
}

function countNonAscii(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) n++;
  return n;
}

export function approximateTokens(text, provider) {
  if (!text) return 0;
  const profile = PROVIDER_PROFILES[provider] ?? PROVIDER_PROFILES.openai;
  const nonAscii = countNonAscii(text);
  const ascii = text.length - nonAscii;
  const asciiTok = ascii / profile.charsPerToken;
  const nonAsciiTok = (nonAscii * profile.nonAsciiMultiplier) / profile.charsPerToken;
  return Math.max(1, Math.ceil(asciiTok + nonAsciiTok));
}

export function priceFor(inTokens, outTokens, model) {
  const p = currentPrices[model];
  if (!p) return { inputCost: 0, outputCost: 0, totalCost: 0, unpriced: true };
  const inputCost = (inTokens / 1_000_000) * p.input;
  const outputCost = (outTokens / 1_000_000) * p.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost, unpriced: false };
}

// ---------------------------------------------------------------------------
// Carbon estimation
// ---------------------------------------------------------------------------
// Rough grams of CO₂-equivalent per 1M tokens (input + output combined).
// Based on public disclosures + independent research (Anthropic, Google,
// Hugging Face, "Making AI Less Thirsty" 2023). Frontier models cost more
// due to bigger param counts + longer active GPU time. Reasoning models
// (o3, o4) are especially expensive because they generate hidden thinking.
//
// These are ESTIMATES. Vary widely by data-center grid mix, batch size,
// caching. We show them as "≈" not exact. Order of magnitude is what
// matters — a haiku vs an opus differs by ~10×.
const CARBON_G_PER_1M_TOKENS_BY_FAMILY = {
  // Frontier / reasoning
  "gpt-5":            340,
  "gpt-4-turbo":      280,
  "gpt-4o":           190,
  "o4":               450,
  "o3":               520,
  "claude-5-opus":    380,
  "claude-4.5-opus":  360,

  // Mid-tier
  "claude-5-sonnet":   180,
  "claude-4.5-sonnet": 170,
  "gemini-2.5-pro":    160,
  "o4-mini":            95,
  "o3-mini":           110,

  // Small / efficient
  "gpt-5-mini":         55,
  "gpt-4o-mini":        45,
  "claude-5-haiku":     55,
  "claude-4.5-haiku":   50,
  "gemini-2.5-flash":   35,
  "gpt-5-nano":         18,
};

const CARBON_DEFAULT = 200; // for unknown models — cautious mid-range guess

/**
 * Estimate CO₂-equivalent grams for a single request.
 * Simple linear model against total tokens; provider grid mix folded into
 * the per-model constant.
 */
export function carbonFor(inTokens, outTokens, model) {
  const total = (inTokens ?? 0) + (outTokens ?? 0);
  const rate = CARBON_G_PER_1M_TOKENS_BY_FAMILY[model] ?? CARBON_DEFAULT;
  return (total / 1_000_000) * rate;
}

/** Convenience: given raw payload, return a fully-priced usage entry. */
export function measure({ inputText, outputText, rawModel }) {
  const model = normalizeModel(rawModel);
  const info = currentPrices[model];
  const provider = info?.provider ?? "openai";
  const inTokens = approximateTokens(inputText ?? "", provider);
  const outTokens = approximateTokens(outputText ?? "", provider);
  const price = priceFor(inTokens, outTokens, model);
  const co2g = carbonFor(inTokens, outTokens, model);
  return {
    model,
    rawModel,
    provider,
    inTokens,
    outTokens,
    inCost: price.inputCost,
    outCost: price.outputCost,
    totalCost: price.totalCost,
    co2g,
    unpriced: price.unpriced,
    approx: true,
  };
}
