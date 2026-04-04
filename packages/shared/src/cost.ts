import type { CostInput } from './types.js';
import { getModelPricing } from './pricing.js';

export function calculateCost(input: CostInput): number {
  const pricing = getModelPricing(input.model);
  if (!pricing) return 0;

  const inputCost = (input.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (input.outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheCreationCost = (input.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPer1M;
  const cacheReadCost = (input.cacheReadTokens / 1_000_000) * pricing.cachePer1M;

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}
