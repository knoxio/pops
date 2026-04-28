/**
 * GitHub API transport — default fetch-based implementation.
 *
 * Handles authentication, event fetching, rate limit queries, and
 * error handling for the GitHub REST API.
 */
import { normaliseGitHubEvent } from './event-normaliser.js';

import type { GitHubApiEvent, GitHubEventType, RawGitHubActivity } from './activity-parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

export interface GitHubTransport {
  authenticate(token: string): Promise<string>;
  fetchActivities(options: {
    username: string;
    repos: string[];
    eventTypes: GitHubEventType[];
    since?: Date;
    limit?: number;
  }): Promise<RawGitHubActivity[]>;
  getRateLimit(): Promise<GitHubRateLimit>;
}

// ---------------------------------------------------------------------------
// Rate limit error
// ---------------------------------------------------------------------------

export class GitHubRateLimitError extends Error {
  constructor(
    message: string,
    readonly resetTimestamp: number
  ) {
    super(message);
    this.name = 'GitHubRateLimitError';
  }
}

// ---------------------------------------------------------------------------
// Fetch-based transport
// ---------------------------------------------------------------------------

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubUserResponse {
  login: string;
}

export class FetchGitHubTransport implements GitHubTransport {
  private token: string = '';

  async authenticate(token: string): Promise<string> {
    this.token = token;
    const response = await this.request<GitHubUserResponse>('/user');
    return response.login;
  }

  async fetchActivities(options: {
    username: string;
    repos: string[];
    eventTypes: GitHubEventType[];
    since?: Date;
    limit?: number;
  }): Promise<RawGitHubActivity[]> {
    const perPage = Math.min(options.limit ?? 100, 100);
    const events = await this.request<GitHubApiEvent[]>(
      `/users/${options.username}/events?per_page=${perPage}`
    );
    return filterAndNormalise(events, options);
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    const response = await this.request<{
      rate: { limit: number; remaining: number; reset: number };
    }>('/rate_limit');
    return response.rate;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 401) {
      throw new Error('GitHub API: invalid token (401 Unauthorized)');
    }
    if (response.status === 403) {
      throwRateLimitOrForbidden(response);
    }
    if (!response.ok) {
      throw new Error(`GitHub API: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

function throwRateLimitOrForbidden(response: Response): never {
  const resetHeader = response.headers.get('X-RateLimit-Reset');
  if (resetHeader) {
    throw new GitHubRateLimitError(
      'GitHub API: rate limit exceeded (403)',
      parseInt(resetHeader, 10)
    );
  }
  throw new Error('GitHub API: forbidden (403)');
}

function filterAndNormalise(
  events: GitHubApiEvent[],
  options: { repos: string[]; eventTypes: GitHubEventType[]; since?: Date; limit?: number }
): RawGitHubActivity[] {
  const activities: RawGitHubActivity[] = [];

  for (const event of events) {
    if (options.since && new Date(event.created_at) < options.since) continue;
    if (
      options.repos.length > 0 &&
      !options.repos.includes('*') &&
      !options.repos.includes(event.repo.name)
    )
      continue;

    const activity = normaliseGitHubEvent(event);
    if (!activity || !options.eventTypes.includes(activity.eventType)) continue;

    activities.push(activity);
  }

  return options.limit ? activities.slice(0, options.limit) : activities;
}
