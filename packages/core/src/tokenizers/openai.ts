import { getEncoding, type Tiktoken } from "js-tiktoken";

// Model → encoding name mapping. Kept small and explicit.
const MODEL_ENCODING: Record<string, "o200k_base" | "cl100k_base"> = {
  "gpt-4o": "o200k_base",
  "gpt-4o-mini": "o200k_base",
  o3: "o200k_base",
  "o3-mini": "o200k_base",
  "gpt-4-turbo": "cl100k_base",
};

const encoders = new Map<string, Tiktoken>();

function encoderFor(model: string): Tiktoken {
  const encoding = MODEL_ENCODING[model] ?? "o200k_base";
  let enc = encoders.get(encoding);
  if (!enc) {
    enc = getEncoding(encoding);
    encoders.set(encoding, enc);
  }
  return enc;
}

export function countOpenAI(text: string, model: string): number {
  return encoderFor(model).encode(text).length;
}

export function isOpenAIModel(model: string): boolean {
  return model in MODEL_ENCODING;
}
