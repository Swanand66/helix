import { knownModels, priceOf } from "@helix-tokens/prices";
import { inputCost, outputCost } from "./cost.js";
import { tokenize } from "./tokenizers/index.js";
import type { EstimateInput, EstimateResult } from "./types.js";

function formatWallTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function totalCostFor(text: string, model: string, maxOutput: number, n: number): number {
  const inputTokens = tokenize(text, model).tokens;
  return (inputCost(inputTokens, model) + outputCost(maxOutput, model)) * n;
}

function suggestAlternatives(
  text: string,
  model: string,
  maxOutput: number,
  n: number,
): EstimateResult["alternatives"] {
  const current = totalCostFor(text, model, maxOutput, n);
  if (current === 0) return [];

  const info = priceOf(model);
  if (!info) return [];

  const candidates = knownModels()
    .filter((m) => m !== model)
    .filter((m) => {
      // Only suggest models with at least the same context window.
      const p = priceOf(m);
      return p && p.context >= info.context / 2;
    })
    .map((m) => ({
      model: m,
      usd: totalCostFor(text, m, maxOutput, n),
    }))
    .filter((row) => row.usd < current)
    .sort((a, b) => a.usd - b.usd)
    .slice(0, 3);

  return candidates.map((row) => ({
    model: row.model,
    usd: row.usd,
    savings: row.usd === 0 ? "free" : `${Math.round(current / row.usd)}x cheaper`,
  }));
}

/**
 * Estimate cost + wall time for a request or batch of requests.
 *
 * @example
 *   estimate({ input: "...", maxOutput: 500, model: "claude-4.5-sonnet", n: 10_000 })
 */
export function estimate(opts: EstimateInput): EstimateResult {
  const { input, model } = opts;
  const maxOutput = opts.maxOutput ?? 500;
  const n = opts.n ?? 1;
  const rps = opts.rps ?? 10;

  const { tokens: inputTokens, approx } = tokenize(input, model);

  const perRequestUsd =
    inputCost(inputTokens, model) + outputCost(maxOutput, model);

  const batchUsd = perRequestUsd * n;
  const totalTokens = (inputTokens + maxOutput) * n;
  const wallSeconds = n / rps;

  return {
    model,
    approx,
    perRequest: {
      inputTokens,
      outputTokens: maxOutput,
      usd: perRequestUsd,
    },
    batch: {
      n,
      totalTokens,
      usd: batchUsd,
      wallTime: formatWallTime(wallSeconds),
    },
    alternatives: suggestAlternatives(input, model, maxOutput, n),
  };
}
