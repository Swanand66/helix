export { prices } from "./data.js";
export type { ModelPrice, PriceTable, Provider } from "./data.js";

import { prices } from "./data.js";

/** Get pricing for a specific model. Returns undefined if unknown. */
export function priceOf(model: string) {
  return prices.models[model];
}

/** All model ids we know about. */
export function knownModels(): string[] {
  return Object.keys(prices.models);
}

/** Filter models by provider. */
export function modelsByProvider(provider: string): string[] {
  return knownModels().filter((m) => prices.models[m]?.provider === provider);
}

/** Age of the price table in hours. */
export function pricesAgeHours(): number {
  const updated = new Date(prices.updated).getTime();
  return (Date.now() - updated) / (1000 * 60 * 60);
}
