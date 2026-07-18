import raw from "../data/prices.json" with { type: "json" };

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "mistral"
  | "deepseek";

export interface ModelPrice {
  provider: Provider;
  family: string;
  /** Max context window in tokens */
  context: number;
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cached-input tokens (if provider supports prompt caching) */
  cachedInput?: number;
}

export interface PriceTable {
  version: string;
  updated: string;
  currency: string;
  unit: string;
  models: Record<string, ModelPrice>;
}

export const prices: PriceTable = raw as PriceTable;
