import { prices, pricesAgeHours } from "@helix-tokens/prices";
import Table from "cli-table3";
import { c, usd } from "../ui/format.js";

export interface PricesArgs {
  json?: boolean;
}

export function pricesCommand(args: PricesArgs): string {
  if (args.json) return JSON.stringify(prices, null, 2);

  const age = pricesAgeHours();
  const ageStr =
    age < 1
      ? `${Math.round(age * 60)} min ago`
      : age < 24
        ? `${Math.round(age)} hours ago`
        : `${Math.round(age / 24)} days ago`;

  const table = new Table({
    head: [c.bold("Model"), c.bold("Input"), c.bold("Output"), c.bold("Cached")],
    style: { head: [], border: ["gray"] },
    colAligns: ["left", "right", "right", "right"],
  });

  const rows = Object.entries(prices.models).sort(([, a], [, b]) => a.input - b.input);

  for (const [id, p] of rows) {
    table.push([
      id,
      usd(p.input),
      usd(p.output),
      p.cachedInput !== undefined ? usd(p.cachedInput) : c.dim("—"),
    ]);
  }

  return [
    c.dim(`Prices per 1M tokens (updated ${ageStr})`),
    table.toString(),
    c.dim(`Source: @helix-tokens/prices v${prices.version}`),
  ].join("\n");
}
