export interface CountResult {
  /** Number of tokens. */
  tokens: number;
  /** Model id the count is for. */
  model: string;
  /** True if the count is a local approximation (Claude, Gemini). */
  approx: boolean;
}

export interface CostResult extends CountResult {
  /** USD cost for the input tokens at the model's current input rate. */
  usd: number;
}

export interface EstimateInput {
  /** Prompt/input text. */
  input: string;
  /** Expected output tokens (defaults to 500). */
  maxOutput?: number;
  /** Model to estimate for. */
  model: string;
  /** Number of requests in the batch (defaults to 1). */
  n?: number;
  /** Requests per second used to compute wall time (defaults to 10). */
  rps?: number;
}

export interface EstimateResult {
  model: string;
  approx: boolean;
  perRequest: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
  };
  batch: {
    n: number;
    totalTokens: number;
    usd: number;
    /** Human-readable ETA at the given rps. */
    wallTime: string;
  };
  /** Cheaper models that could serve the same request (up to 3). */
  alternatives: Array<{
    model: string;
    usd: number;
    /** e.g. "25x cheaper" */
    savings: string;
  }>;
}

export interface BudgetOptions {
  max: number;
  model: string;
  maxOutput?: number;
}

export interface BudgetResult {
  fits: boolean;
  spent: number;
  budget: number;
  remaining: number;
  model: string;
  tokens: number;
  approx: boolean;
  suggestions: Array<{ model: string; usd: number }>;
}

export interface CompareRow {
  model: string;
  tokens: number;
  usd: number;
  approx: boolean;
  fitsContext: boolean;
  context: number;
  rank: number;
}
