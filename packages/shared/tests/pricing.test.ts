import { describe, it, expect } from 'vitest';
import { getModelPricing } from '../src/pricing.js';

describe('getModelPricing', () => {
  it('returns pricing for claude-sonnet-4-6', () => {
    const pricing = getModelPricing('claude-sonnet-4-6');
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1M).toBeGreaterThan(0);
    expect(pricing!.outputPer1M).toBeGreaterThan(0);
  });

  it('returns pricing for claude-opus-4-6', () => {
    const pricing = getModelPricing('claude-opus-4-6');
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1M).toBeGreaterThan(pricing!.cachePer1M!);
  });

  it('returns null for unknown model', () => {
    expect(getModelPricing('gpt-5-turbo')).toBeNull();
  });
});
