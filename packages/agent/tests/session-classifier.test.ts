import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { classifySession } from '../src/session-classifier.js';

describe('classifySession', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('classifies as agent_local when CI env var is set', () => {
    process.env.CI = 'true';
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('agent_local');
  });

  it('classifies as agent_local when GITHUB_ACTIONS is set', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('agent_local');
  });

  it('classifies interactive CLI sessions as human', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('human');
  });

  it('classifies api entrypoint as agent_local', () => {
    expect(classifySession({ entrypoint: 'api', userType: 'external' })).toBe('agent_local');
  });
});
