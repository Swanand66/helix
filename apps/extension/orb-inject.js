// orb-inject.js — runs in the extension's isolated world alongside content.js.
// Mounts the Helix orb + panel into the current tab's DOM using an open
// Shadow Root so the host page's CSS can never affect our styles.
//
// State model:
//   idle           — quiet base outline (no glow)
//   is-streaming   — while an SSE chat stream is active (or bumped within
//                    GRACE_MS). Neon trace fades in and flows smoothly.
//   is-over-budget — red static breathing (if we implement budgets)
//   is-paused      — dim, no motion (user paused tracking)

(() => {
  if (window.__HELIX_ORB__) return;
  window.__HELIX_ORB__ = true;

  const HOST_ID = "helix-orb-host";
  const GRACE_MS = 900;
  const STORAGE_KEY = "helix.events";

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }

    :root, .root {
      --hue-idle: 190;
      --hue-active: 190;
      --hue-over: 0;
      --hue-paused: 220;
      --accent: hsl(var(--hue-idle), 90%, 55%);
      --accent-soft: hsl(var(--hue-idle), 90%, 55%, 0.35);
      --panel-bg: rgba(15, 23, 42, 0.94);
      --panel-border: rgba(148, 163, 184, 0.18);
      --panel-fg: #f1f5f9;
      --panel-fg-dim: #94a3b8;
      --panel-divider: rgba(148, 163, 184, 0.1);
      --warn: #f59e0b;
      --bad: #ef4444;
      color-scheme: dark;
    }

    /* ============================== ORB ============================== */

    .orb {
      position: absolute;
      inset: 0;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      background: transparent;
      transition: color 400ms ease;
      user-select: none;
      -webkit-user-select: none;
    }
    .orb:active { cursor: grabbing; }

    .orb > svg.logo {
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      transition: transform 200ms ease;
      will-change: transform;
    }
    .orb:hover > svg.logo { transform: scale(1.06); }

    .logo-base {
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      opacity: 0.28;
      transition: opacity 600ms ease, stroke 600ms ease;
    }

    .logo-trace {
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      stroke-dasharray: 20 80;
      stroke-dashoffset: 0;
      opacity: 0;
      filter: none;
      animation: neon-flow 3.6s linear infinite;
      transition:
        opacity 700ms cubic-bezier(0.22, 1, 0.36, 1),
        filter  700ms ease,
        stroke  500ms ease;
      will-change: stroke-dashoffset, opacity;
    }

    @keyframes neon-flow {
      from { stroke-dashoffset: 0; }
      to   { stroke-dashoffset: -100; }
    }

    /* Streaming */
    .orb.is-streaming .logo-base { opacity: 0.5; }
    .orb.is-streaming .logo-trace {
      opacity: 1;
      filter:
        drop-shadow(0 0 2px hsla(var(--hue-active), 100%, 95%, 1))
        drop-shadow(0 0 6px hsla(var(--hue-active), 100%, 75%, 0.85))
        drop-shadow(0 0 14px hsla(var(--hue-active), 100%, 65%, 0.5));
    }

    /* Over-budget */
    .orb.is-over-budget { color: hsl(var(--hue-over), 90%, 62%); }
    .orb.is-over-budget .logo-base {
      opacity: 0.75;
      animation: over-breathe 3s ease-in-out infinite;
      filter:
        drop-shadow(0 0 3px hsla(var(--hue-over), 100%, 65%, 0.7))
        drop-shadow(0 0 8px hsla(var(--hue-over), 100%, 55%, 0.4));
    }
    .orb.is-over-budget .logo-trace { opacity: 0; }
    @keyframes over-breathe {
      0%, 100% { opacity: 0.65; }
      50%      { opacity: 0.95; }
    }

    /* Paused */
    .orb.is-paused { color: hsl(var(--hue-paused), 15%, 55%); opacity: 0.45; }
    .orb.is-paused .logo-base { opacity: 0.4; filter: none; }
    .orb.is-paused .logo-trace { opacity: 0; filter: none; }

    /* --------------------------------------------------------------------- */
    /* Per-source colors — applied only while streaming, so idle stays cyan. */
    /* --------------------------------------------------------------------- */

    .orb.is-streaming.is-source-chatgpt { color: hsl(140, 90%, 55%); }
    .orb.is-streaming.is-source-chatgpt .logo-trace {
      filter:
        drop-shadow(0 0 2px hsla(140, 100%, 95%, 1))
        drop-shadow(0 0 6px hsla(140, 100%, 70%, 0.9))
        drop-shadow(0 0 14px hsla(140, 100%, 55%, 0.5));
    }

    .orb.is-streaming.is-source-claude { color: hsl(25, 100%, 62%); }
    .orb.is-streaming.is-source-claude .logo-trace {
      filter:
        drop-shadow(0 0 2px hsla(25, 100%, 95%, 1))
        drop-shadow(0 0 6px hsla(25, 100%, 70%, 0.9))
        drop-shadow(0 0 14px hsla(25, 100%, 55%, 0.55));
    }

    .orb.is-streaming.is-source-gemini { color: hsl(210, 100%, 62%); }
    .orb.is-streaming.is-source-gemini .logo-trace {
      filter:
        drop-shadow(0 0 2px hsla(210, 100%, 95%, 1))
        drop-shadow(0 0 6px hsla(210, 100%, 70%, 0.9))
        drop-shadow(0 0 14px hsla(210, 100%, 55%, 0.5));
    }

    .orb.is-streaming.is-source-fable { color: hsl(280, 100%, 65%); }
    .orb.is-streaming.is-source-fable .logo-trace {
      filter:
        drop-shadow(0 0 2px hsla(280, 100%, 95%, 1))
        drop-shadow(0 0 6px hsla(280, 100%, 70%, 0.9))
        drop-shadow(0 0 14px hsla(280, 100%, 55%, 0.5));
    }

    /* ============================= PANEL ============================= */

    .panel {
      position: absolute;
      right: 0;
      bottom: 56px;
      width: 320px;
      max-height: 460px;
      overflow: hidden auto;
      background: var(--panel-bg);
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      color: var(--panel-fg);
      box-shadow:
        0 20px 40px -18px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      transform-origin: bottom right;
      transition: opacity 200ms ease, transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
      font-size: 12px;
    }
    .panel.is-hidden {
      opacity: 0;
      transform: scale(0.94) translateY(6px);
      pointer-events: none;
    }

    .panel-h {
      padding: 10px 12px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--panel-divider);
    }
    .panel-h .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 12px;
    }
    .panel-h .brand svg {
      width: 14px;
      height: 14px;
      color: var(--accent);
      filter: drop-shadow(0 0 4px var(--accent-soft));
    }
    .panel-h button {
      background: transparent;
      border: none;
      color: var(--panel-fg-dim);
      padding: 4px 6px;
      cursor: pointer;
      font-size: 13px;
      border-radius: 4px;
    }
    .panel-h button:hover { color: var(--panel-fg); background: rgba(148, 163, 184, 0.1); }

    .panel-section {
      padding: 10px 12px;
      border-bottom: 1px solid var(--panel-divider);
    }
    .panel-section:last-child { border-bottom: none; }
    .panel-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--panel-fg-dim);
      margin-bottom: 4px;
    }
    .panel-big {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .panel-big .n {
      font-size: 11px;
      color: var(--panel-fg-dim);
      font-variant-numeric: tabular-nums;
    }
    .panel-big .cost {
      font-size: 20px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    .panel-rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-variant-numeric: tabular-nums;
      margin-top: 6px;
    }
    .panel-rows .row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      font-size: 11px;
      padding: 2px 0;
    }
    .panel-rows .row .tok { color: var(--panel-fg-dim); text-align: right; }
    .panel-rows .row .cost { text-align: right; }
    .empty {
      padding: 16px;
      text-align: center;
      color: var(--panel-fg-dim);
      font-size: 11px;
    }
  `;

  const LOGO_PATH =
    'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z';

  const HTML = `
    <div class="root">
      <div class="panel is-hidden" id="helix-panel">
        <div class="panel-h">
          <div class="brand">
            <svg viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="${LOGO_PATH}"/>
            </svg>
            <span>Helix</span>
          </div>
          <button id="helix-close">✕</button>
        </div>
        <div class="panel-section">
          <div class="panel-label">Today</div>
          <div class="panel-big">
            <span class="n" id="helix-today-n">— tokens · — chats</span>
            <span class="cost" id="helix-today-cost">$0</span>
          </div>
          <div class="panel-rows" id="helix-today-rows"></div>
        </div>
        <div class="panel-section">
          <div class="panel-label">This month</div>
          <div class="panel-big">
            <span class="n" id="helix-month-n">— tokens · — chats</span>
            <span class="cost" id="helix-month-cost">$0</span>
          </div>
          <div class="panel-rows" id="helix-month-rows"></div>
        </div>
      </div>

      <div class="orb" id="helix-orb" title="Helix — click to see usage">
        <svg class="logo" viewBox="0 0 24 24" fill="none">
          <path class="logo-base"  d="${LOGO_PATH}" pathLength="100"/>
          <path class="logo-trace" d="${LOGO_PATH}" pathLength="100"/>
        </svg>
      </div>
    </div>
  `;

  // ---------------------------------------------------------------------------
  // Mount into the page
  // ---------------------------------------------------------------------------

  function mount() {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "position:fixed;right:24px;bottom:24px;width:44px;height:44px;" +
      "z-index:2147483647;pointer-events:none;";

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    const wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    wrap.style.cssText = "position:absolute;inset:0;pointer-events:auto;";
    shadow.appendChild(wrap);

    document.documentElement.appendChild(host);

    wire(shadow);
  }

  // ---------------------------------------------------------------------------
  // Behavior
  // ---------------------------------------------------------------------------

  function wire(shadow) {
    const orb = shadow.getElementById("helix-orb");
    const panel = shadow.getElementById("helix-panel");
    const closeBtn = shadow.getElementById("helix-close");

    // --- streaming state -----------------------------------------------------

    const SOURCE_CLASSES = [
      "is-source-chatgpt",
      "is-source-claude",
      "is-source-gemini",
      "is-source-fable",
    ];

    let streaming = false;
    let stopTimer = null;
    let currentSource = null;

    function applySourceClass(source) {
      for (const c of SOURCE_CLASSES) orb.classList.remove(c);
      if (source) orb.classList.add(`is-source-${source}`);
    }

    function startStreaming(source) {
      streaming = true;
      currentSource = source || currentSource;
      clearTimeout(stopTimer);
      stopTimer = null;
      applySourceClass(currentSource);
      orb.classList.add("is-streaming");
    }
    function bumpStreaming() {
      if (!streaming) startStreaming(currentSource);
      else if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    }
    function stopStreaming() {
      if (!streaming) return;
      streaming = false;
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        orb.classList.remove("is-streaming");
        applySourceClass(null); // reset to default cyan when quiet
        stopTimer = null;
        render(); // refresh totals when a chat finishes
      }, GRACE_MS);
    }

    // Expose so the message relay below can call them.
    window.__HELIX_ORB_API__ = { startStreaming, bumpStreaming, stopStreaming, render: () => render() };

    // --- panel toggle --------------------------------------------------------

    let draggedRecently = false;

    orb.addEventListener("click", (e) => {
      if (draggedRecently) return;
      panel.classList.toggle("is-hidden");
      if (!panel.classList.contains("is-hidden")) render();
      e.stopPropagation();
    });
    closeBtn.addEventListener("click", () => panel.classList.add("is-hidden"));

    // Click outside the shadow root closes the panel.
    document.addEventListener("click", (e) => {
      if (panel.classList.contains("is-hidden")) return;
      // Composed path lets us see through the shadow boundary.
      const path = e.composedPath();
      if (path.includes(orb) || path.includes(panel)) return;
      panel.classList.add("is-hidden");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") panel.classList.add("is-hidden");
    });

    // --- drag ---------------------------------------------------------------

    const host = document.getElementById(HOST_ID);
    let dragging = false;
    let start = null;
    let hostStart = null;

    orb.addEventListener("pointerdown", (e) => {
      dragging = true;
      start = { x: e.clientX, y: e.clientY };
      const rect = host.getBoundingClientRect();
      hostStart = { x: rect.left, y: rect.top };
      orb.setPointerCapture(e.pointerId);
    });
    orb.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      draggedRecently = true;
      const x = Math.max(0, Math.min(window.innerWidth - 44, hostStart.x + dx));
      const y = Math.max(0, Math.min(window.innerHeight - 44, hostStart.y + dy));
      host.style.left = x + "px";
      host.style.top = y + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    });
    orb.addEventListener("pointerup", (e) => {
      dragging = false;
      orb.releasePointerCapture(e.pointerId);
      setTimeout(() => (draggedRecently = false), 100);
    });

    // --- data rendering ------------------------------------------------------

    function fmtUsd(n) {
      if (n === 0) return "$0";
      if (n < 0.0001) return "$" + n.toFixed(6);
      if (n < 0.01)   return "$" + n.toFixed(4);
      if (n < 1)      return "$" + n.toFixed(3);
      return "$" + n.toFixed(2);
    }
    function fmtNum(n) { return n.toLocaleString("en-US"); }
    function startOfDay(ts) { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
    function startOfMonth(ts) { const d = new Date(ts); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); }

    function aggregate(events, since) {
      const filtered = events.filter((e) => e.ts >= since);
      const byModel = new Map();
      let tokens = 0, cost = 0;
      for (const e of filtered) {
        tokens += (e.inTokens ?? 0) + (e.outTokens ?? 0);
        cost += e.totalCost ?? 0;
        const key = e.model || e.rawModel || "unknown";
        const cur = byModel.get(key) ?? { tokens: 0, cost: 0, count: 0 };
        cur.tokens += (e.inTokens ?? 0) + (e.outTokens ?? 0);
        cur.cost += e.totalCost ?? 0;
        cur.count += 1;
        byModel.set(key, cur);
      }
      const rows = [...byModel.entries()]
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.tokens - a.tokens);
      return { count: filtered.length, tokens, cost, rows };
    }

    function renderRows(el, rows) {
      if (rows.length === 0) { el.innerHTML = ""; return; }
      el.innerHTML = rows
        .map((r) =>
          `<div class="row"><span>${r.model}</span><span class="tok">${fmtNum(r.tokens)} tok</span><span class="cost">${fmtUsd(r.cost)}</span></div>`)
        .join("");
    }

    async function render() {
      let events = [];
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        events = stored[STORAGE_KEY] ?? [];
      } catch { /* extension context lost, ignore */ }

      const now = Date.now();
      const today = aggregate(events, startOfDay(now));
      const month = aggregate(events, startOfMonth(now));

      shadow.getElementById("helix-today-n").textContent =
        `${fmtNum(today.tokens)} tokens · ${today.count} chats`;
      shadow.getElementById("helix-today-cost").textContent = fmtUsd(today.cost);
      renderRows(shadow.getElementById("helix-today-rows"), today.rows);

      shadow.getElementById("helix-month-n").textContent =
        `${fmtNum(month.tokens)} tokens · ${month.count} chats`;
      shadow.getElementById("helix-month-cost").textContent = fmtUsd(month.cost);
      renderRows(shadow.getElementById("helix-month-rows"), month.rows);
    }

    render();
  }

  // Wait for a body to attach to (some SPA sites are late).
  function whenReady(cb) {
    if (document.body) return cb();
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        cb();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  whenReady(mount);

  // ---------------------------------------------------------------------------
  // Bridge: HELIX_STREAM messages from page-hook.js drive orb state
  // ---------------------------------------------------------------------------

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.type !== "HELIX_STREAM") return;
    const api = window.__HELIX_ORB_API__;
    if (!api) return;
    if (msg.event === "start")     api.startStreaming(msg.source);
    else if (msg.event === "bump") api.bumpStreaming();
    else if (msg.event === "end")  api.stopStreaming();
  });
})();
