// preview-inject.js — live cost preview badge on chatgpt.com and claude.ai.
//
// Injects a small floating badge near each chat input that shows, in real
// time as you type:
//   • estimated token count of your current input
//   • estimated USD cost at the site's default model
//
// The badge lives in its OWN Shadow DOM host so nothing from the page can
// touch its styles. Positioned fixed, follows the input on scroll/resize.
//
// Token math is a lightweight approximator (mirrors tokenize.js — the exact
// same char-per-token constants), so no message-passing latency during
// typing. Actual per-message cost lands in the panel after send, as before.

(() => {
  if (window.__HELIX_PREVIEW__) return;
  window.__HELIX_PREVIEW__ = true;

  // ---------------------------------------------------------------------------
  // Site detection + defaults
  // ---------------------------------------------------------------------------

  const SOURCE =
    location.host.includes("chatgpt.com") ? "chatgpt" :
    location.host.includes("claude.ai")   ? "claude"  :
    location.host.includes("gemini.google.com") ? "gemini" :
    null;
  if (!SOURCE) return;

  // Default model + rates used for the preview when we don't know exactly
  // which model the current chat will use. Overridden if we cached a recent
  // event for this source in chrome.storage (see below).
  const DEFAULTS = {
    chatgpt: { model: "gpt-4o",            provider: "openai",    inputRate: 2.5,  color: 140 },
    claude:  { model: "claude-4.5-sonnet", provider: "anthropic", inputRate: 3.0,  color: 25  },
    gemini:  { model: "gemini-2.5-pro",    provider: "google",    inputRate: 1.25, color: 210 },
  };
  let current = { ...DEFAULTS[SOURCE] };

  // Per-provider chars-per-token — matches tokenize.js FALLBACK_PRICES.
  const CHARS_PER_TOKEN = {
    openai: 4.0, anthropic: 3.5, google: 4.0, meta: 3.8, mistral: 3.9, deepseek: 3.7,
  };

  function estimateTokens(text, provider) {
    if (!text) return 0;
    const cpt = CHARS_PER_TOKEN[provider] ?? 4.0;
    let nonAscii = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) nonAscii++;
    const ascii = text.length - nonAscii;
    return Math.max(1, Math.ceil(ascii / cpt + (nonAscii * 2) / cpt));
  }

  function fmtCost(n) {
    if (n < 0.0001) return `<$0.001`;
    if (n < 0.01)   return `$${n.toFixed(4)}`;
    if (n < 1)     return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  }

  // ---------------------------------------------------------------------------
  // Learn the actual current model from stored events so the preview matches
  // whatever model was last used on this site.
  // ---------------------------------------------------------------------------

  // In-memory cache of the user's rate limits + recent usage so we can
  // decorate the preview badge with "x/N msgs left" when close to a cap.
  let limits = { maxMessagesPerHour: 0, maxDollarsPerDay: 0 };
  let usage  = { hourCount: 0, dayCost: 0 };
  const HOUR_MS = 3_600_000;

  async function refreshCurrentFromCache() {
    try {
      const { "helix.events": events = [], "helix.prices": prices = null, "helix.limits": storedLimits } =
        await chrome.storage.local.get(["helix.events", "helix.prices", "helix.limits"]);
      // Most recent event on this source, if any
      const latest = [...events].reverse().find((e) => e.source === SOURCE);
      if (latest?.model) current.model = latest.model;
      if (latest?.provider) current.provider = latest.provider;
      // Fresh rate from cached prices, if the model appears there
      if (prices && prices[current.model]?.input != null) {
        current.inputRate = prices[current.model].input;
      }
      // Limits + current usage
      if (storedLimits) limits = { ...limits, ...storedLimits };
      const now = Date.now();
      const startOfDayTs = (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); })();
      usage.hourCount = events.filter((e) => e.ts >= now - HOUR_MS).length;
      usage.dayCost   = events.filter((e) => e.ts >= startOfDayTs)
                              .reduce((s, e) => s + (e.totalCost ?? 0), 0);
    } catch { /* extension context torn down; ignore */ }
  }

  chrome.runtime.onMessage?.addListener?.(() => refreshCurrentFromCache());
  chrome.storage?.onChanged?.addListener?.((changes) => {
    if (changes["helix.events"] || changes["helix.prices"]) refreshCurrentFromCache();
  });

  // ---------------------------------------------------------------------------
  // Badge (its own Shadow DOM host)
  // ---------------------------------------------------------------------------

  const badge = createBadge();

  function createBadge() {
    const host = document.createElement("div");
    host.id = "helix-preview-host";
    host.style.cssText =
      "position:fixed;top:-1000px;left:-1000px;z-index:2147483646;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .b {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px;
        background: rgba(15, 23, 42, 0.86);
        color: #e2e8f0;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 999px;
        font-family: ui-monospace, "SFMono-Regular", "Menlo", monospace;
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
        backdrop-filter: blur(10px) saturate(1.4);
        -webkit-backdrop-filter: blur(10px) saturate(1.4);
        box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.45);
        opacity: 0;
        transform: translateY(2px);
        transition: opacity 180ms ease, transform 180ms ease;
        white-space: nowrap;
        pointer-events: none;
      }
      .b.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .b .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: hsl(var(--source-hue, 190), 90%, 60%);
        box-shadow: 0 0 6px hsla(var(--source-hue, 190), 90%, 60%, 0.6);
      }
      .b .tok  { color: #cbd5e1; }
      .b .sep  { opacity: 0.35; }
      .b .cost { color: hsl(var(--source-hue, 190), 90%, 65%); font-weight: 600; }
    `;
    shadow.appendChild(style);
    const b = document.createElement("div");
    b.className = "b";
    b.innerHTML =
      `<span class="dot"></span>` +
      `<span class="tok">0 tok</span>` +
      `<span class="sep">·</span>` +
      `<span class="cost">$0</span>` +
      `<span class="limit" style="display:none;color:#f59e0b"></span>`;
    shadow.appendChild(b);
    // Set source hue via CSS variable on the wrapper (survives shadow boundary).
    b.style.setProperty("--source-hue", String(DEFAULTS[SOURCE].color));
    document.documentElement.appendChild(host);
    return { host, shadow, el: b };
  }

  function updateBadge(text) {
    const tokens = estimateTokens(text, current.provider);
    if (tokens <= 0) {
      badge.el.classList.remove("is-visible");
      return;
    }
    const cost = (tokens / 1_000_000) * current.inputRate;
    badge.shadow.querySelector(".tok").textContent = tokens.toLocaleString() + " tok";
    badge.shadow.querySelector(".cost").textContent = fmtCost(cost);
    // Rate-limit hint, only when a cap is set and we're within 80% of it.
    const limitEl = badge.shadow.querySelector(".limit");
    const hint = limitHintText();
    if (hint) {
      limitEl.textContent = "· " + hint;
      limitEl.style.display = "";
    } else {
      limitEl.style.display = "none";
    }
    badge.el.classList.add("is-visible");
  }

  function limitHintText() {
    // Hourly message cap
    const hCap = Number(limits.maxMessagesPerHour) || 0;
    if (hCap > 0) {
      const remaining = hCap - usage.hourCount;
      if (remaining <= 0) return `hourly cap reached`;
      if (usage.hourCount / hCap >= 0.8) return `${remaining} msg left / hr`;
    }
    // Daily $ cap
    const dCap = Number(limits.maxDollarsPerDay) || 0;
    if (dCap > 0) {
      const remaining = dCap - usage.dayCost;
      if (remaining <= 0) return `daily $ cap reached`;
      if (usage.dayCost / dCap >= 0.8) return `$${remaining.toFixed(2)} left today`;
    }
    return "";
  }

  // ---------------------------------------------------------------------------
  // Positioning: follow the current input's top-right corner.
  // ---------------------------------------------------------------------------

  let anchor = null; // current tracked input element

  function positionBadge() {
    if (!anchor || !document.body.contains(anchor)) {
      badge.el.classList.remove("is-visible");
      badge.host.style.top = "-1000px";
      return;
    }
    const rect = anchor.getBoundingClientRect();
    // Guard against invisible/collapsed inputs
    if (rect.width === 0 || rect.height === 0) {
      badge.el.classList.remove("is-visible");
      badge.host.style.top = "-1000px";
      return;
    }
    // Above the input, aligned to right edge
    const top = Math.max(4, rect.top - 26);
    const badgeWidth = badge.el.getBoundingClientRect().width || 120;
    const left = Math.max(4, rect.right - badgeWidth);
    badge.host.style.top = `${top}px`;
    badge.host.style.left = `${left}px`;
  }

  window.addEventListener("scroll",  positionBadge, { passive: true, capture: true });
  window.addEventListener("resize",  positionBadge);

  // ---------------------------------------------------------------------------
  // Find + attach to the chat input. Both sites use various selectors that
  // change with UI redesigns, so we try a list. The MutationObserver
  // re-attaches when the SPA swaps the input (e.g. new-chat button).
  // ---------------------------------------------------------------------------

  const INPUT_SELECTORS = {
    chatgpt: [
      "#prompt-textarea",
      "textarea[data-id]",
      'div[contenteditable="true"]#prompt-textarea',
      'form textarea',
    ],
    claude: [
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"][data-testid="chat-input"]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    gemini: [
      'div[contenteditable="true"].ql-editor',
      'rich-textarea div[contenteditable="true"]',
      'textarea',
    ],
  };

  function findInput() {
    const selectors = INPUT_SELECTORS[SOURCE] || [];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // Skip hidden/tiny
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 20) continue;
      return el;
    }
    return null;
  }

  function readInputText(el) {
    // textareas expose .value; contenteditable divs use innerText/textContent
    if (typeof el.value === "string") return el.value;
    return (el.innerText || el.textContent || "").trim();
  }

  function attach(el) {
    if (el.__helix_preview_bound) return;
    el.__helix_preview_bound = true;
    anchor = el;

    const onInput = () => {
      updateBadge(readInputText(el));
      positionBadge();
    };
    el.addEventListener("input",  onInput);
    el.addEventListener("focus",  onInput);
    el.addEventListener("keyup",  onInput);
    // Initial state
    onInput();

    // Hide badge when input scrolls out of view
    const io = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting;
      if (!visible) badge.el.classList.remove("is-visible");
      else if (readInputText(el)) badge.el.classList.add("is-visible");
    }, { threshold: 0.1 });
    io.observe(el);
  }

  function tryAttach() {
    const el = findInput();
    if (el) attach(el);
  }

  // Kick off + watch SPA mutations.
  tryAttach();
  const observer = new MutationObserver(() => {
    tryAttach();
    // If our current anchor was removed, re-anchor to a fresh input.
    if (anchor && !document.body.contains(anchor)) {
      anchor = null;
      tryAttach();
    }
    positionBadge();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Bootstrap: load cached model/prices so we're accurate from the first key.
  refreshCurrentFromCache();

  console.log(
    "%c[helix]%c preview badge installed on " + location.host,
    "color:#06b6d4;font-weight:bold",
    "color:inherit",
  );
})();
