import { describe, it, expect } from 'vitest';
import { normalizeProjectSlug } from '../src/project-slug.js';

describe('normalizeProjectSlug', () => {
  it('extracts slug from HTTPS git remote URL', () => {
    expect(normalizeProjectSlug('https://github.com/acme/payments-service.git'))
      .toBe('acme/payments-service');
  });

  it('extracts slug from SSH git remote URL', () => {
    expect(normalizeProjectSlug('git@github.com:acme/payments-service.git'))
      .toBe('acme/payments-service');
  });

  it('handles URLs without .git suffix', () => {
    expect(normalizeProjectSlug('https://github.com/acme/payments-service'))
      .toBe('acme/payments-service');
  });

  it('handles GitLab URLs', () => {
    expect(normalizeProjectSlug('https://gitlab.com/org/subgroup/repo.git'))
      .toBe('org/subgroup/repo');
  });

  it('falls back to directory name for non-URL input', () => {
    expect(normalizeProjectSlug('/home/user/projects/my-app'))
      .toBe('my-app');
  });

  it('falls back to directory name for Windows paths', () => {
    expect(normalizeProjectSlug('C:\\Users\\dev\\projects\\my-app'))
      .toBe('my-app');
  });

  it('returns "unknown" for empty input', () => {
    expect(normalizeProjectSlug('')).toBe('unknown');
  });
});
