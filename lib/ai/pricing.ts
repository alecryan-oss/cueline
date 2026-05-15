// Per-1M-token prices in USD. Verified against
// https://platform.openai.com/docs/pricing — re-check at integration time, OpenAI
// drops prices roughly twice a year.
//
// `cached_input` is OpenAI's automatic prompt-cache rate (50% of base input for
// 4o, 50% for 4o-mini). Embeddings have no caching tier.

import type { ModelId } from './models';

export type PriceKind = 'input' | 'output' | 'cached_input';

type PriceTable = Partial<Record<PriceKind, number>>;

const PRICES_PER_MILLION_TOKENS: Record<ModelId, PriceTable> = {
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
    cached_input: 0.075,
  },
  'gpt-4o': {
    input: 2.5,
    output: 10.0,
    cached_input: 1.25,
  },
  'text-embedding-3-small': {
    input: 0.02,
  },
};

export function priceFor(model: ModelId, kind: PriceKind): number {
  const table = PRICES_PER_MILLION_TOKENS[model];
  const price = table[kind];
  if (price === undefined) {
    throw new Error(`No ${kind} price configured for model ${model}`);
  }
  return price;
}

export type CostInputs = {
  model: ModelId;
  inputTokens: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

/**
 * USD cost for one API call. Splits inputTokens into uncached + cached
 * portions so cached tokens get the discounted rate. OpenAI's `usage` object
 * reports `prompt_tokens` (the total input) and `prompt_tokens_details.cached_tokens`
 * (the subset that hit cache); pass them as `inputTokens` and `cachedInputTokens`
 * respectively.
 */
export function computeCost(inputs: CostInputs): number {
  const { model, inputTokens, outputTokens = 0, cachedInputTokens = 0 } = inputs;

  if (cachedInputTokens > inputTokens) {
    throw new Error(
      `cachedInputTokens (${cachedInputTokens}) cannot exceed inputTokens (${inputTokens})`,
    );
  }

  const uncachedInput = inputTokens - cachedInputTokens;
  const inputRate = priceFor(model, 'input');
  const outputRate = outputTokens > 0 ? priceFor(model, 'output') : 0;
  const cachedRate = cachedInputTokens > 0 ? priceFor(model, 'cached_input') : 0;

  return (
    (uncachedInput * inputRate) / 1_000_000 +
    (cachedInputTokens * cachedRate) / 1_000_000 +
    (outputTokens * outputRate) / 1_000_000
  );
}
