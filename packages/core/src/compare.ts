import { knownModels, priceOf } from "@helix-tokens/prices";
import { cost } from "./cost.js";
import type { CompareRow } from "./types.js";

/**
 * Compare token count and input cost for `text` across multiple models.
 * Sorted ascending by USD (cheapest first). Pass `models` to restrict,
 * otherwise all known models are compared.
 *
 * @example
 *   compare("hello", ["gpt-4o", "claude-4.5-sonnet", "gemini-2.5-pro"])
 */
export function compare(text: string, models?: string[]): CompareRow[] {
  const list = models && models.length > 0 ? models : knownModels();

  const rows = list.map((model) => {
    const c = cost(text, model);
    const info = priceOf(model);
    return {
      model,
      tokens: c.tokens,
      usd: c.usd,
      approx: c.approx,
      context: info?.context ?? 0,
      fitsContext: (info?.context ?? 0) >= c.tokens,
    };
  });

  rows.sort((a, b) => a.usd - b.usd);

  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}
