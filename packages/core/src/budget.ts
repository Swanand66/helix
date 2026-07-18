import { knownModels } from "@helix-tokens/prices";
import { cost } from "./cost.js";
import type { BudgetOptions, BudgetResult } from "./types.js";

/**
 * Check whether counting `text` against `model` fits within a USD budget.
 * If it doesn't, `suggestions` lists cheaper models that would fit.
 *
 * @example
 *   budget("hello world", { max: 0.01, model: "gpt-4o" })
 */
export function budget(text: string, opts: BudgetOptions): BudgetResult {
  const { max, model } = opts;
  const primary = cost(text, model);
  const fits = primary.usd <= max;

  const suggestions = fits
    ? []
    : knownModels()
        .filter((m) => m !== model)
        .map((m) => ({ model: m, usd: cost(text, m).usd }))
        .filter((row) => row.usd <= max)
        .sort((a, b) => a.usd - b.usd)
        .slice(0, 3);

  return {
    fits,
    spent: primary.usd,
    budget: max,
    remaining: max - primary.usd,
    model,
    tokens: primary.tokens,
    approx: primary.approx,
    suggestions,
  };
}
