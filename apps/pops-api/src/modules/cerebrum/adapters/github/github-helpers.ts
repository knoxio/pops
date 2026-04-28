import {
  activityMatchesFilter,
  type GitHubEventType,
  type RawGitHubActivity,
} from './activity-parser.js';

/**
 * GitHub adapter helpers — filter matching, health status building, and
 * activity body formatting. Extracted from github-adapter.ts and
 * activity-parser.ts to respect max-lines.
 */
import type { AdapterStatus, IngestFilter } from '../types.js';
import type { GitHubRateLimit } from './github-transport.js';

// ---------------------------------------------------------------------------
// Activity body formatting
// ---------------------------------------------------------------------------

function formatEventType(eventType: GitHubEventType): string {
  const labels: Record<GitHubEventType, string> = {
    'issues.assigned': 'Issue Assigned',
    'pull_request.review_requested': 'PR Review Requested',
    'pull_request.merged': 'PR Merged',
    'issue_comment.mentioned': 'Mentioned in Comment',
    commit: 'Commit',
    'pull_request.opened': 'PR Opened',
    'issues.opened': 'Issue Opened',
  };
  return labels[eventType] ?? eventType;
}

function appendOptionalSections(sections: string[], activity: RawGitHubActivity): void {
  if (activity.labels && activity.labels.length > 0) {
    sections.push(`**Labels:** ${activity.labels.map((l) => `\`${l.name}\``).join(', ')}`);
  }
  if (activity.milestone) {
    sections.push(`**Milestone:** ${activity.milestone}`);
  }
  if (activity.eventType.startsWith('pull_request') && activity.changedFiles !== undefined) {
    sections.push(
      `**Changes:** ${activity.changedFiles} files, +${activity.additions ?? 0} / -${activity.deletions ?? 0}`
    );
  }
  if (activity.linkedIssues && activity.linkedIssues.length > 0) {
    sections.push(`**Linked:** ${activity.linkedIssues.join(', ')}`);
  }
}

/** Build a structured Markdown body from a GitHub activity. */
export function buildActivityBody(activity: RawGitHubActivity): string {
  const sections: string[] = [];

  sections.push(`**Type:** ${formatEventType(activity.eventType)}`);
  sections.push(`**Repository:** [${activity.repo}](https://github.com/${activity.repo})`);
  sections.push(`**Author:** @${activity.actor.login}`);
  sections.push(`**Link:** [View on GitHub](${activity.url})`);
  appendOptionalSections(sections, activity);

  if (activity.body && activity.body.trim().length > 0) {
    const body = activity.body.trim();
    const truncated = body.length > 2000 ? `${body.slice(0, 2000)}...\n\n*(truncated)*` : body;
    sections.push(`---\n\n${truncated}`);
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

/** Check if a GitHub activity passes include/exclude filter rules. */
export function passesGitHubFilters(
  activity: RawGitHubActivity,
  filters?: IngestFilter[]
): boolean {
  if (!filters || filters.length === 0) return true;
  const includes = filters.filter((f) => f.type === 'include');
  const excludes = filters.filter((f) => f.type === 'exclude');
  if (includes.length > 0) {
    const matched = includes.some((f) => activityMatchesFilter(activity, f.field, f.pattern));
    if (!matched) return false;
  }
  if (excludes.some((f) => activityMatchesFilter(activity, f.field, f.pattern))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Health status helpers
// ---------------------------------------------------------------------------

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

/** Get an ISO timestamp for the current moment. */
export { now };
