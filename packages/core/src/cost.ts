import { priceOf } from "@helix-tokens/prices";
import { tokenize } from "./tokenizers/index.js";
import type { CostResult } from "./types.js";

/** USD cost for a given token count on a given model's input rate. */
export function inputCost(tokens: number, model: string): number {
  const p = priceOf(model);
  if (!p) throw new Error(`Unknown model: "${model}"`);
  return (tokens / 1_000_000) * p.input;
}

/** USD cost for a given token count on a given model's output rate. */
export function outputCost(tokens: number, model: string): number {
  const p = priceOf(model);
  if (!p) throw new Error(`Unknown model: "${model}"`);
  return (tokens / 1_000_000) * p.output;
}

/**
 * Count tokens for `text` on `model` and compute the input-side USD cost.
 *
 * @example
 *   cost("hello world", "gpt-4o")
 *   // { tokens: 2, model: "gpt-4o", usd: 0.000005, approx: false }
 */
export function cost(text: string, model: string): CostResult {
  const { tokens, approx } = tokenize(text, model);
  return {
    tokens,
    model,
    approx,
    usd: inputCost(tokens, model),
  };
}
