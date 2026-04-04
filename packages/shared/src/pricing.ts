export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheCreationPer1M: number;
  cachePer1M: number;
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cacheCreationPer1M: 18.75,
    cachePer1M: 1.5,
  },
  'claude-sonnet-4-6': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheCreationPer1M: 3.75,
    cachePer1M: 0.3,
  },
  'claude-haiku-4-5': {
    inputPer1M: 0.8,
    outputPer1M: 4.0,
    cacheCreationPer1M: 1.0,
    cachePer1M: 0.08,
  },
};

export function getModelPricing(model: string): ModelPricing | null {
  if (PRICING_TABLE[model]) return PRICING_TABLE[model];

  for (const [key, pricing] of Object.entries(PRICING_TABLE)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }

  return null;
}
