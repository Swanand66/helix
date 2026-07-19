// popup.js — reads chrome.storage.local["helix.events"] and renders the
// today/month breakdown. Refreshes every time the popup opens.

const STORAGE_KEY = "helix.events";

// Minimal HTML entity escape — used anywhere we interpolate storage-derived
// data (like a model id) into innerHTML. Providers always return safe
// strings today, but this defends against future surprises and satisfies
// reviewer code scans.
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtUsd(n) {
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toFixed(6)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregate(events, since) {
  const filtered = events.filter((e) => e.ts >= since);
  const byModel = new Map();
  let tokens = 0;
  let cost = 0;
  let hasUnpriced = false;
  for (const e of filtered) {
    tokens += (e.inTokens ?? 0) + (e.outTokens ?? 0);
    cost += e.totalCost ?? 0;
    if (e.unpriced) hasUnpriced = true;
    const key = e.model || e.rawModel || "unknown";
    const cur = byModel.get(key) ?? { tokens: 0, cost: 0, count: 0, unpriced: false };
    cur.tokens += (e.inTokens ?? 0) + (e.outTokens ?? 0);
    cur.cost += e.totalCost ?? 0;
    cur.count += 1;
    if (e.unpriced) cur.unpriced = true;
    byModel.set(key, cur);
  }
  const rows = [...byModel.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.tokens - a.tokens); // sort by tokens so unpriced rows still rank
  return { count: filtered.length, tokens, cost, hasUnpriced, rows };
}

function renderSection(label, agg) {
  if (agg.count === 0) return "";
  const rows = agg.rows
    .map((r) => {
      const model = esc(r.model);
      const costCell = r.unpriced
        ? `<span title="No price for ${model} yet">—</span>`
        : esc(fmtUsd(r.cost));
      return `
        <tr>
          <td class="model">${model}${r.unpriced ? ' <span class="warn" title="Unknown price">⚠</span>' : ""}</td>
          <td class="tokens">${fmtNum(r.tokens)} tok</td>
          <td class="cost">${costCell}</td>
        </tr>`;
    })
    .join("");
  const unpricedNote = agg.hasUnpriced
    ? `<div class="note">Some models have no price yet — tokens still counted.</div>`
    : "";
  return `
    <section>
      <div class="label">${label}</div>
      <div class="big">
        <span class="tok">${fmtNum(agg.tokens)} tokens · ${agg.count} chats</span>
        <span class="cost">${fmtUsd(agg.cost)}</span>
      </div>
      <table>${rows}</table>
      ${unpricedNote}
    </section>
  `;
}

async function render() {
  const { [STORAGE_KEY]: events = [] } = await chrome.storage.local.get(STORAGE_KEY);
  const root = document.getElementById("root");

  if (events.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <strong>No usage tracked yet</strong>
        Open <code>chatgpt.com</code>, <code>claude.ai</code>,
        <code>gemini.google.com</code>, or <code>aistudio.google.com</code>,<br />
        send a message, then reopen this popup.
      </div>
    `;
    return;
  }

  const now = Date.now();
  const today = aggregate(events, startOfDay(now));
  const month = aggregate(events, startOfMonth(now));

  root.innerHTML = `
    ${renderSection("Today", today)}
    ${renderSection("This month", month)}
  `;
}

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Clear all tracked usage?")) return;
  await chrome.storage.local.remove(STORAGE_KEY);
  render();
});

// Show the real extension version in the footer instead of hard-coding it.
try {
  const v = chrome.runtime.getManifest?.().version;
  if (v) document.getElementById("version").textContent = "v" + v;
} catch { /* ignore */ }

render();
