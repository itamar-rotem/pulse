import { describe, it, expect } from 'vitest';
import {
  formatTokens,
  formatCost,
  formatDuration,
  formatRelativeTime,
  getBurnRateStatus,
} from '../format';

describe('formatTokens', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500');
  });
  it('formats thousands as k', () => {
    expect(formatTokens(1000)).toBe('1k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(42300)).toBe('42.3k');
  });
  it('formats millions as M', () => {
    expect(formatTokens(1000000)).toBe('1M');
    expect(formatTokens(3200000)).toBe('3.2M');
  });
  it('formats billions as B', () => {
    expect(formatTokens(1000000000)).toBe('1B');
    expect(formatTokens(2500000000)).toBe('2.5B');
  });
  it('handles zero', () => {
    expect(formatTokens(0)).toBe('0');
  });
});

describe('formatCost', () => {
  it('formats small costs with 2 decimal places', () => {
    expect(formatCost(0.012)).toBe('$0.01');
    expect(formatCost(1.50)).toBe('$1.50');
  });
  it('formats medium costs with 2 decimal places', () => {
    expect(formatCost(139.92)).toBe('$139.92');
  });
  it('formats large costs as k', () => {
    expect(formatCost(3786)).toBe('$3.8k');
    expect(formatCost(12500)).toBe('$12.5k');
  });
  it('handles zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });
});

describe('formatDuration', () => {
  it('formats minutes-only durations', () => {
    const start = '2026-04-07T10:00:00Z';
    const end = '2026-04-07T10:45:00Z';
    expect(formatDuration(start, end)).toBe('45m');
  });
  it('formats hours + minutes', () => {
    const start = '2026-04-07T10:00:00Z';
    const end = '2026-04-07T12:14:00Z';
    expect(formatDuration(start, end)).toBe('2h 14m');
  });
  it('returns Active when no end time', () => {
    const start = '2026-04-07T10:00:00Z';
    expect(formatDuration(start, null)).toBe('Active');
    expect(formatDuration(start, undefined)).toBe('Active');
  });
  it('handles zero duration', () => {
    const start = '2026-04-07T10:00:00Z';
    expect(formatDuration(start, start)).toBe('0m');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds ago', () => {
    const now = new Date();
    const thirtySecsAgo = new Date(now.getTime() - 30000).toISOString();
    expect(formatRelativeTime(thirtySecsAgo)).toBe('just now');
  });
  it('formats minutes ago', () => {
    const now = new Date();
    const twoMinsAgo = new Date(now.getTime() - 120000).toISOString();
    expect(formatRelativeTime(twoMinsAgo)).toBe('2 minutes ago');
  });
  it('formats hours ago', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });
});

describe('getBurnRateStatus', () => {
  it('returns healthy for normal rates', () => {
    expect(getBurnRateStatus(500)).toBe('healthy');
  });
  it('returns warning for elevated rates', () => {
    expect(getBurnRateStatus(1500)).toBe('warning');
  });
  it('returns hot for high rates', () => {
    expect(getBurnRateStatus(3000)).toBe('hot');
  });
  it('uses custom baseline', () => {
    expect(getBurnRateStatus(200, 100)).toBe('warning');
    expect(getBurnRateStatus(300, 100)).toBe('hot');
  });
});
