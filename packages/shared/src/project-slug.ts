export function normalizeProjectSlug(input: string): string {
  if (!input) return 'unknown';

  const sshMatch = input.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  try {
    const url = new URL(input);
    const validSchemes = ['http:', 'https:', 'ssh:', 'git:'];
    if (validSchemes.includes(url.protocol)) {
      const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
      if (path) return path;
    }
  } catch {
    // Not a URL
  }

  const normalized = input.replace(/\\/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').pop();
  return lastSegment || 'unknown';
}
