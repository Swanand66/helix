import { knownModels } from "@helix-tokens/prices";
import { tokenize } from "./tokenizers/index.js";
import type { CountResult } from "./types.js";

/**
 * Count tokens for a single model.
 *
 * @example
 *   count("hello world", "gpt-4o")            // 2
 */
export function count(text: string, model: string): number;

/**
 * Count tokens across all known models. Returns an object keyed by model id.
 *
 * @example
 *   count("hello world")
 *   // { "gpt-4o": 2, "claude-4.5-sonnet": 2, "gemini-2.5-pro": 3, ... }
 */
export function count(text: string): Record<string, number>;

export function count(text: string, model?: string): number | Record<string, number> {
  if (model) {
    return tokenize(text, model).tokens;
  }

  const out: Record<string, number> = {};
  for (const m of knownModels()) {
    out[m] = tokenize(text, m).tokens;
  }
  return out;
}

/**
 * Like {@link count} but returns richer metadata per model
 * (including the `approx` flag).
 */
export function countDetailed(text: string): CountResult[];
export function countDetailed(text: string, model: string): CountResult;
export function countDetailed(
  text: string,
  model?: string,
): CountResult | CountResult[] {
  if (model) {
    const { tokens, approx } = tokenize(text, model);
    return { tokens, model, approx };
  }
  return knownModels().map((m) => {
    const { tokens, approx } = tokenize(text, m);
    return { tokens, model: m, approx };
  });
}
