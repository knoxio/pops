/**
 * GitHub activity parser — converts raw GitHub API data into EngineData.
 *
 * Handles issue, PR, commit, and comment events. Filters bot noise
 * and formats activity as structured Markdown.
 */
import type { EngineData } from '../types.js';

// Re-export event normalisation from its own module.
export { normaliseGitHubEvent } from './event-normaliser.js';

// ---------------------------------------------------------------------------
// GitHub event types
// ---------------------------------------------------------------------------

export type GitHubEventType =
  | 'issues.assigned'
  | 'pull_request.review_requested'
  | 'pull_request.merged'
  | 'issue_comment.mentioned'
  | 'commit'
  | 'pull_request.opened'
  | 'issues.opened';

export interface GitHubActor {
  login: string;
  type: 'User' | 'Bot' | 'Organization';
}

export interface GitHubLabel {
  name: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Raw GitHub activity (normalised from API responses)
// ---------------------------------------------------------------------------

export interface RawGitHubActivity {
  id: string;
  eventType: GitHubEventType;
  repo: string;
  title: string;
  body?: string;
  actor: GitHubActor;
  labels?: GitHubLabel[];
  linkedIssues?: string[];
  milestone?: string;
  url: string;
  createdAt: string;
  merged?: boolean;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
}

/** GitHub API event shape (from the /events endpoint). */
export interface GitHubApiEvent {
  id: string;
  type: string;
  repo: { name: string };
  actor: { login: string; display_login?: string };
  payload: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------

function buildActivityBody(activity: RawGitHubActivity): string {
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

// ---------------------------------------------------------------------------
// Tag extraction & bot detection
// ---------------------------------------------------------------------------

export function buildActivityTags(activity: RawGitHubActivity): string[] {
  const tags = [
    `repo:${activity.repo}`,
    `event:${activity.eventType}`,
    `author:${activity.actor.login}`,
  ];
  if (activity.labels) {
    for (const label of activity.labels) tags.push(`label:${label.name.toLowerCase()}`);
  }
  if (activity.merged) tags.push('merged');
  return tags;
}

const DEFAULT_BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot/i,
  /^renovate/i,
  /^greenkeeper/i,
  /^codecov/i,
  /^github-actions/i,
  /^mergify/i,
];

export function isBot(actor: GitHubActor): boolean {
  if (actor.type === 'Bot') return true;
  return DEFAULT_BOT_PATTERNS.some((p) => p.test(actor.login));
}

// ---------------------------------------------------------------------------
// Activity → EngineData conversion
// ---------------------------------------------------------------------------

export interface GitHubParserOptions {
  scopeLabel: string;
}

export function parseGitHubActivity(
  activity: RawGitHubActivity,
  options: GitHubParserOptions
): EngineData {
  return {
    title: activity.title,
    body: buildActivityBody(activity),
    source: 'plexus:github',
    externalId: activity.id,
    tags: buildActivityTags(activity),
    scopes: [options.scopeLabel],
    customFields: {
      event_type: activity.eventType,
      repo: activity.repo,
      author: activity.actor.login,
      is_bot: isBot(activity.actor),
      url: activity.url,
      created_at: activity.createdAt,
      merged: activity.merged ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export function activityMatchesFilter(
  activity: RawGitHubActivity,
  field: string,
  pattern: string
): boolean {
  const regex = new RegExp(pattern, 'i');
  switch (field) {
    case 'event_type':
    case 'action':
      return regex.test(activity.eventType);
    case 'repo':
      return regex.test(activity.repo);
    case 'author':
      return regex.test(activity.actor.login);
    case 'is_bot':
      return String(isBot(activity.actor)) === pattern;
    default:
      return false;
  }
}
