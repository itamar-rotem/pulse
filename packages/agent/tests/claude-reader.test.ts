import { describe, it, expect } from 'vitest';
import { parseJsonlLine, extractUsage, getSessionDir } from '../src/claude-reader.js';

describe('parseJsonlLine', () => {
  it('parses an assistant message with usage data', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 8,
          cache_creation_input_tokens: 12821,
          cache_read_input_tokens: 6473,
        },
      },
      sessionId: 'abc-123',
      timestamp: '2026-03-15T01:04:03.604Z',
      cwd: 'C:\\Users\\dev\\projects\\my-app',
      userType: 'external',
      entrypoint: 'cli',
    });

    const parsed = parseJsonlLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe('abc-123');
    expect(parsed!.model).toBe('claude-sonnet-4-6');
    expect(parsed!.cwd).toBe('C:\\Users\\dev\\projects\\my-app');
  });

  it('returns null for non-assistant messages', () => {
    const line = JSON.stringify({ type: 'user', message: { role: 'user' } });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('returns null for assistant messages without usage', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(parseJsonlLine(line)).toBeNull();
  });
});

describe('extractUsage', () => {
  it('extracts token counts from usage object', () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    };
    const result = extractUsage(usage);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.cacheCreationTokens).toBe(200);
    expect(result.cacheReadTokens).toBe(300);
  });

  it('defaults missing fields to 0', () => {
    const usage = { input_tokens: 10, output_tokens: 5 };
    const result = extractUsage(usage);
    expect(result.cacheCreationTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
  });
});

describe('getSessionDir', () => {
  it('returns the Claude projects directory path', () => {
    const dir = getSessionDir();
    expect(dir).toContain('.claude');
    expect(dir).toContain('projects');
  });
});
