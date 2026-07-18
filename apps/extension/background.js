// background.js — MV3 service worker.
//
// Two jobs:
//   1. Receive raw HELIX_USAGE events from every tab's content script,
//      tokenize them via tokenize.js, and store compact entries in
//      chrome.storage.local for the popup + in-page panel to read.
//   2. Keep the pricing table fresh by fetching a hosted prices.json
//      once per day (chrome.alarms). Falls back to bundled prices if the
//      remote is unreachable or misconfigured.
//
// Nothing else ever leaves the browser. No accounts, no telemetry.

import { measure, updatePrices, PRICES } from "./tokenize.js";

const STORAGE_KEY_EVENTS = "helix.events";
const STORAGE_KEY_PRICES = "helix.prices";
const STORAGE_KEY_PRICES_TS = "helix.prices.updatedAt";
const MAX_EVENTS = 5000; // ~40 days at 100 chats/day

const ALARM_NAME = "helix.refreshPrices";
const REFRESH_HOURS = 24;

/**
 * URL of a hosted prices.json served over HTTPS. Same shape as
 * FALLBACK_PRICES in tokenize.js — a map of `modelId → { provider, input,
 * output }` (USD per 1M tokens).
 *
 * Set to `null` to disable remote refresh entirely (extension will always
 * use bundled prices).
 *
 * Recommended setup: publish prices.json to a public GitHub repo and use
 * the raw content URL, e.g.
 *   "https://raw.githubusercontent.com/<user>/helix/main/prices.json"
 * Combine with a daily GitHub Action that scrapes provider pricing pages
 * and commits any diff — that's the "auto-update" loop.
 *
 * Remember to also add the URL's host to `host_permissions` in
 * manifest.json (Chrome requires this for fetch() from a service worker
 * cross-origin).
 */
const PRICES_URL = "https://raw.githubusercontent.com/Swanand66/helix_price/main/prices.json";

// ---------------------------------------------------------------------------
// Message handler — records tracked chat events
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  handle(msg).catch((err) => console.warn("[helix bg] handle failed:", err));
  return false;
});

async function handle(msg) {
  if (!msg || typeof msg !== "object" || !msg.source) return;

  const measured = measure({
    inputText: msg.inputText,
    outputText: msg.outputText,
    rawModel: msg.model,
  });

  const entry = {
    ts: msg.ts ?? Date.now(),
    source: msg.source,
    model: measured.model,
    rawModel: measured.rawModel,
    provider: measured.provider,
    inTokens: measured.inTokens,
    outTokens: measured.outTokens,
    inCost: measured.inCost,
    outCost: measured.outCost,
    totalCost: measured.totalCost,
    unpriced: measured.unpriced,
    approx: measured.approx,
  };

  await appendEvent(entry);

  if (entry.unpriced) {
    console.warn(
      `[helix bg] no price for model "${entry.rawModel}" (normalized to "${entry.model}"). ` +
        "Tokens still counted; add it to PRICES in tokenize.js or to your hosted prices.json.",
    );
  }
  console.log("[helix bg] tracked", entry);
}

async function appendEvent(entry) {
  const { [STORAGE_KEY_EVENTS]: events = [] } =
    await chrome.storage.local.get(STORAGE_KEY_EVENTS);
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  await chrome.storage.local.set({ [STORAGE_KEY_EVENTS]: events });
}

// ---------------------------------------------------------------------------
// Prices: load cached → apply → schedule daily refresh
// ---------------------------------------------------------------------------

async function loadCachedPrices() {
  try {
    const { [STORAGE_KEY_PRICES]: cached } =
      await chrome.storage.local.get(STORAGE_KEY_PRICES);
    if (cached && typeof cached === "object") {
      updatePrices(cached);
      console.log(
        `[helix bg] loaded cached prices (${Object.keys(cached).length} models)`,
      );
    }
  } catch (err) {
    console.warn("[helix bg] failed to load cached prices:", err);
  }
}

async function refreshPricesFromRemote() {
  if (!PRICES_URL) {
    console.log("[helix bg] PRICES_URL not configured — using bundled prices");
    return;
  }
  try {
    const res = await fetch(PRICES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("bad shape");

    updatePrices(data);
    await chrome.storage.local.set({
      [STORAGE_KEY_PRICES]: data,
      [STORAGE_KEY_PRICES_TS]: Date.now(),
    });
    console.log(
      `[helix bg] refreshed prices from remote (${Object.keys(data).length} models)`,
    );
  } catch (err) {
    console.warn(`[helix bg] price refresh failed: ${err.message}`);
  }
}

// Boot sequence — runs every time the service worker wakes up.
loadCachedPrices();
refreshPricesFromRemote();

// Ensure the daily alarm exists (idempotent; safe to call on every wake).
chrome.alarms.get(ALARM_NAME, (alarm) => {
  if (!alarm) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: REFRESH_HOURS * 60,
      periodInMinutes: REFRESH_HOURS * 60,
    });
    console.log(`[helix bg] scheduled daily price refresh (every ${REFRESH_HOURS}h)`);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshPricesFromRemote();
});

// Also refresh on install/update — good UX for first run.
chrome.runtime.onInstalled.addListener(() => {
  refreshPricesFromRemote();
});

// Expose bundled fallback count in the log so devs can confirm what's loaded.
console.log(
  `[helix bg] service worker up · fallback prices: ${Object.keys(PRICES).length} models`,
);
