import { prices } from "@helix-tokens/prices";
import { approximateTokens } from "./approximate.js";
import { countOpenAI, isOpenAIModel } from "./openai.js";

export interface TokenizeResult {
  tokens: number;
  approx: boolean;
}

/**
 * Tokenize text for a specific model. Exact for OpenAI (via js-tiktoken),
 * approximated for every other provider. The result carries `approx: true`
 * when the count is a local approximation.
 */
export function tokenize(text: string, model: string): TokenizeResult {
  if (isOpenAIModel(model)) {
    return { tokens: countOpenAI(text, model), approx: false };
  }

  const info = prices.models[model];
  if (!info) {
    throw new Error(
      `Unknown model: "${model}". Known models: ${Object.keys(prices.models).join(", ")}`,
    );
  }

  // Free/local models still get provider-specific approximation.
  return { tokens: approximateTokens(text, info.provider), approx: true };
}
