/**
 * GitHub adapter helpers — health status building and metrics.
 * Extracted from github-adapter.ts to respect max-lines.
 * No imports from sibling parser files to avoid circular dependencies.
 */
import type { AdapterStatus } from '../types.js';
import type { GitHubRateLimit } from './github-transport.js';

function now(): string {
  return new Date().toISOString();
}

/** Build metrics record for health check response. */
export function buildMetrics(
  rl: GitHubRateLimit,
  pct: number,
  repos: number
): Record<string, unknown> {
  return {
    rateLimit: rl.limit,
    rateLimitRemaining: rl.remaining,
    rateLimitReset: new Date(rl.reset * 1000).toISOString(),
    rateLimitUsagePercent: Math.round(pct),
    trackedRepos: repos,
  };
}

/** Build an error health status response. */
export function buildErrorHealthStatus(err: unknown): AdapterStatus {
  const msg = err instanceof Error ? err.message : String(err);
  const isAuthError = msg.includes('401') || msg.includes('invalid token');
  return {
    status: isAuthError ? 'error' : 'degraded',
    message: isAuthError ? `Token invalid: ${msg}` : `Health check failed: ${msg}`,
    lastChecked: now(),
  };
}

export { now };
