// content.js — runs in the extension's isolated world at document_start.
// Two jobs:
//   1. Inject page-hook.js into the page's *main* JS world so it can override fetch.
//   2. Listen for HELIX_USAGE window messages posted by page-hook and forward
//      them to the background service worker.

(() => {
  console.log(
    "%c[helix]%c content-script starting on " + location.host,
    "color:#06b6d4;font-weight:bold",
    "color:inherit",
  );

  // 1. Inject page-hook into the page's main world.
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("page-hook.js");
    s.async = false; // load before other scripts if possible
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (err) {
    console.warn("[helix] failed to inject page-hook:", err);
  }

  // 2. Relay HELIX_USAGE messages to the service worker.
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.type !== "HELIX_USAGE" || !msg.payload) return;
    console.log(
      "%c[helix]%c relaying to background: " + msg.payload.source + " / " + msg.payload.model,
      "color:#06b6d4;font-weight:bold",
      "color:inherit",
    );
    try {
      chrome.runtime.sendMessage(msg.payload).catch(() => {});
    } catch {
      // service worker may be dormant; message will drop silently.
    }
  });
})();
