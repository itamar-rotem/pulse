import { describe, it, expect } from 'vitest';
import { SessionTracker } from '../src/session-tracker.js';
import type { ParsedMessage } from '../src/claude-reader.js';

describe('SessionTracker', () => {
  it('creates a new tracked session on first message', () => {
    const tracker = new SessionTracker();
    const msg: ParsedMessage = {
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const event = tracker.processMessage(msg);
    expect(event).not.toBeNull();
    expect(event!.cumulativeInputTokens).toBe(100);
    expect(event!.cumulativeOutputTokens).toBe(50);
    expect(event!.cumulativeCostUsd).toBeGreaterThan(0);
  });

  it('accumulates tokens across messages in same session', () => {
    const tracker = new SessionTracker();
    const base = {
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage({ ...base, timestamp: new Date().toISOString(), inputTokens: 100, outputTokens: 50 });
    const event2 = tracker.processMessage({ ...base, timestamp: new Date().toISOString(), inputTokens: 200, outputTokens: 100 });

    expect(event2!.cumulativeInputTokens).toBe(300);
    expect(event2!.cumulativeOutputTokens).toBe(150);
  });

  it('computes burn rate', () => {
    const tracker = new SessionTracker();
    const now = Date.now();
    const base = {
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage({ ...base, timestamp: new Date(now - 60000).toISOString(), inputTokens: 100, outputTokens: 50 });
    const event2 = tracker.processMessage({ ...base, timestamp: new Date(now).toISOString(), inputTokens: 200, outputTokens: 100 });

    expect(event2!.burnRatePerMin).toBeGreaterThan(0);
  });

  it('returns active sessions list', () => {
    const tracker = new SessionTracker();
    const msg: ParsedMessage = {
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage(msg);
    const active = tracker.getActiveSessions();
    expect(active).toHaveLength(1);
    expect(active[0].sessionId).toBe('sess-1');
  });
});
