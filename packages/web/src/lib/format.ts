/**
 * Format a token count to a human-readable string.
 * 1000 → "1k", 1000000 → "1M", 1000000000 → "1B"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Format a USD cost value.
 * $0.012 → "$0.01", $139.92 → "$139.92", $3786 → "$3.8k"
 */
export function formatCost(n: number): string {
  if (n >= 1000) return `$${+(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/**
 * Format a duration between two ISO timestamps.
 * Returns "Active" if endedAt is null/undefined.
 */
export function formatDuration(
  startedAt: string,
  endedAt?: string | null,
): string {
  if (!endedAt) return 'Active';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Format a timestamp as relative time ("2 minutes ago", "1 hour ago").
 */
export function formatRelativeTime(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000,
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Classify burn rate as healthy/warning/hot.
 * Default baseline: 1000 tokens/min.
 */
export function getBurnRateStatus(
  rate: number,
  baseline = 1000,
): 'healthy' | 'warning' | 'hot' {
  const ratio = rate / baseline;
  if (ratio >= 2.5) return 'hot';
  if (ratio >= 1.5) return 'warning';
  return 'healthy';
}
