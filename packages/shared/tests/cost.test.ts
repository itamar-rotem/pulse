import { describe, it, expect } from 'vitest';
import { calculateCost } from '../src/cost.js';

describe('calculateCost', () => {
  it('calculates cost for a session with input and output tokens', () => {
    const cost = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      outputTokens: 5000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBeGreaterThan(0);
    expect(typeof cost).toBe('number');
  });

  it('accounts for cache tokens being cheaper', () => {
    const costNocache = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      outputTokens: 1000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    const costWithCache = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 5000,
      outputTokens: 1000,
      cacheCreationTokens: 0,
      cacheReadTokens: 5000,
    });
    expect(costWithCache).toBeLessThan(costNocache);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCost({
      model: 'unknown-model',
      inputTokens: 10000,
      outputTokens: 5000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
