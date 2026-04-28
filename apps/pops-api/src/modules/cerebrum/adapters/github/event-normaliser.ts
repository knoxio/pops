/**
 * GitHub API event normalisation — converts raw GitHub API event payloads
 * into the normalised RawGitHubActivity format used by the adapter.
 */
import type { GitHubApiEvent, GitHubEventType, RawGitHubActivity } from './activity-parser.js';

// ---------------------------------------------------------------------------
// Payload types (GitHub API response shapes)
// ---------------------------------------------------------------------------

interface GitHubIssuePayload {
  number: number;
  title: string;
  body?: string;
  html_url: string;
  user: { login: string; type: string };
  labels?: Array<{ name: string; color?: string }>;
  milestone?: { title: string };
}

interface GitHubPullRequestPayload extends GitHubIssuePayload {
  merged?: boolean;
  changed_files?: number;
  additions?: number;
  deletions?: number;
}

interface GitHubCommentPayload {
  id: number;
  body?: string;
  html_url: string;
  user: { login: string; type: string };
}

// ---------------------------------------------------------------------------
// Per-event-type normalisers
// ---------------------------------------------------------------------------

function normaliseIssueEvent(event: GitHubApiEvent): RawGitHubActivity | null {
  const issue = event.payload['issue'] as GitHubIssuePayload | undefined;
  if (!issue) return null;
  const action = event.payload['action'] as string;

  return {
    id: event.id,
    eventType: action === 'assigned' ? 'issues.assigned' : 'issues.opened',
    repo: event.repo.name,
    title: issue.title,
    body: issue.body,
    actor: { login: event.actor.login, type: 'User' },
    labels: issue.labels?.map((l) => ({ name: l.name, color: l.color })),
    milestone: issue.milestone?.title,
    url: issue.html_url,
    createdAt: event.created_at,
  };
}

function normalisePullRequestEvent(event: GitHubApiEvent): RawGitHubActivity | null {
  const pr = event.payload['pull_request'] as GitHubPullRequestPayload | undefined;
  if (!pr) return null;
  const action = event.payload['action'] as string;

  let eventType: GitHubEventType;
  if (action === 'closed' && pr.merged) {
    eventType = 'pull_request.merged';
  } else if (action === 'review_requested') {
    eventType = 'pull_request.review_requested';
  } else {
    eventType = 'pull_request.opened';
  }

  return {
    id: event.id,
    eventType,
    repo: event.repo.name,
    title: pr.title,
    body: pr.body,
    actor: { login: event.actor.login, type: 'User' },
    labels: pr.labels?.map((l) => ({ name: l.name, color: l.color })),
    milestone: pr.milestone?.title,
    url: pr.html_url,
    createdAt: event.created_at,
    merged: pr.merged,
    changedFiles: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
  };
}

function normaliseCommentEvent(event: GitHubApiEvent): RawGitHubActivity | null {
  const issue = event.payload['issue'] as GitHubIssuePayload | undefined;
  const comment = event.payload['comment'] as GitHubCommentPayload | undefined;
  if (!issue || !comment) return null;

  return {
    id: event.id,
    eventType: 'issue_comment.mentioned',
    repo: event.repo.name,
    title: `Comment on: ${issue.title}`,
    body: comment.body,
    actor: {
      login: comment.user.login,
      type: comment.user.type === 'Bot' ? 'Bot' : 'User',
    },
    labels: issue.labels?.map((l) => ({ name: l.name, color: l.color })),
    url: comment.html_url,
    createdAt: event.created_at,
  };
}

function normalisePushEvent(event: GitHubApiEvent): RawGitHubActivity | null {
  const commits = event.payload['commits'] as
    | Array<{ sha: string; message: string; author: { name: string } }>
    | undefined;
  if (!commits || commits.length === 0) return null;

  const head = commits.at(-1);
  if (!head) return null;

  const firstLine = head.message.split('\n')[0] ?? head.message;

  return {
    id: event.id,
    eventType: 'commit',
    repo: event.repo.name,
    title: firstLine,
    body:
      commits.length > 1
        ? `Pushed ${commits.length} commits:\n${commits.map((c) => `- ${c.message.split('\n')[0] ?? c.message}`).join('\n')}`
        : head.message,
    actor: { login: event.actor.login, type: 'User' },
    url: `https://github.com/${event.repo.name}/commit/${head.sha}`,
    createdAt: event.created_at,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Normalise a GitHub API event into a RawGitHubActivity.
 * Returns null for event types we don't handle.
 */
export function normaliseGitHubEvent(event: GitHubApiEvent): RawGitHubActivity | null {
  switch (event.type) {
    case 'IssuesEvent':
      return normaliseIssueEvent(event);
    case 'PullRequestEvent':
      return normalisePullRequestEvent(event);
    case 'IssueCommentEvent':
      return normaliseCommentEvent(event);
    case 'PushEvent':
      return normalisePushEvent(event);
    default:
      return null;
  }
}
