import Table from "cli-table3";
import { compare } from "helix-tokens";
import { approxMark, c, num, starBadge, usd } from "./format.js";

/** Render the default "count across models" table. */
export function renderCompareTable(text: string, models?: string[]): string {
  const rows = compare(text, models);

  // Show paid models first (sorted cheapest-first from compare()), then free/local
  // models at the bottom. The ★ marks the cheapest *paid* option.
  const paid = rows.filter((r) => r.usd > 0);
  const free = rows.filter((r) => r.usd === 0);
  const ordered = [...paid, ...free];
  const cheapestPaid = paid[0];

  const table = new Table({
    head: [
      c.bold("Model"),
      c.bold("Tokens"),
      c.bold("Input $"),
      c.bold("Fits Context"),
    ],
    style: { head: [], border: ["gray"] },
    colAligns: ["left", "right", "right", "left"],
    chars: {
      mid: "",
      "left-mid": "",
      "mid-mid": "",
      "right-mid": "",
    },
  });

  for (const row of ordered) {
    const isCheapest = cheapestPaid !== undefined && row.model === cheapestPaid.model;
    const tokenStr = `${num(row.tokens)}${approxMark(row.approx)}`;
    const costStr = row.usd === 0 ? c.dim("(local)") : usd(row.usd);
    const fitsStr = row.fitsContext
      ? c.green(`✓ ${humanContext(row.context)}`)
      : c.red(`✗ ${humanContext(row.context)}`);
    const modelStr = isCheapest ? c.bold().green(row.model) : row.model;
    const trailing = isCheapest ? ` ${starBadge()}` : "";

    table.push([modelStr + trailing, tokenStr, costStr, fitsStr]);
  }

  return table.toString();
}

function humanContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}
