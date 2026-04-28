/**
 * Tests for the GitHubAdapter and activity parser (PRD-091 US-03).
 *
 * Covers:
 * - Activity → EngineData parsing (title, body, tags, scopes)
 * - Bot detection and noise filtering
 * - Tag extraction from activity metadata
 * - Filter matching
 * - Adapter lifecycle (initialize, ingest, healthCheck, shutdown)
 * - Incremental sync per repo
 * - Rate limit handling
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activityMatchesFilter,
  buildActivityTags,
  isBot,
  parseGitHubActivity,
  type RawGitHubActivity,
} from './activity-parser.js';
import {
  GitHubAdapter,
  GitHubRateLimitError,
  type GitHubAdapterSettings,
  type GitHubRateLimit,
  type GitHubTransport,
} from './github-adapter.js';

import type { AdapterConfig, IngestFilter } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert array element at index exists and return it (avoids noUncheckedIndexedAccess). */
function at<T>(arr: T[], index: number): T {
  const item = arr[index];
  if (item === undefined) throw new Error(`Expected element at index ${index}`);
  return item;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<RawGitHubActivity> = {}): RawGitHubActivity {
  return {
    id: 'evt-001',
    eventType: 'issues.assigned',
    repo: 'acme/api',
    title: 'Fix login bug',
    body: 'Users are unable to log in when using SSO.',
    actor: { login: 'alice', type: 'User' },
    labels: [{ name: 'bug', color: 'ff0000' }, { name: 'priority-high' }],
    milestone: 'v2.0',
    url: 'https://github.com/acme/api/issues/42',
    createdAt: '2026-04-28T09:00:00Z',
    ...overrides,
  };
}

function makePrActivity(overrides: Partial<RawGitHubActivity> = {}): RawGitHubActivity {
  return makeActivity({
    id: 'evt-002',
    eventType: 'pull_request.merged',
    title: 'Implement SSO fix',
    body: 'Fixes #42. Updated the auth middleware.',
    url: 'https://github.com/acme/api/pull/43',
    merged: true,
    changedFiles: 5,
    additions: 120,
    deletions: 30,
    ...overrides,
  });
}

function makeConfig(
  overrides: Partial<GitHubAdapterSettings> = {}
): AdapterConfig<GitHubAdapterSettings> {
  return {
    name: 'github',
    credentials: { token: 'ghp_test_token_12345' },
    settings: {
      username: 'alice',
      repos: ['acme/api'],
      scopeLabel: 'work.dev.github',
      ...overrides,
    },
  };
}

function createMockTransport(activities: RawGitHubActivity[] = []): GitHubTransport {
  return {
    authenticate: vi.fn().mockResolvedValue('alice'),
    fetchActivities: vi.fn().mockResolvedValue(activities),
    getRateLimit: vi.fn().mockResolvedValue({
      limit: 5000,
      remaining: 4500,
      reset: Math.floor(Date.now() / 1000) + 3600,
    } satisfies GitHubRateLimit),
  };
}

// ---------------------------------------------------------------------------
// Activity parser tests
// ---------------------------------------------------------------------------

describe('isBot', () => {
  it('detects Bot type', () => {
    expect(isBot({ login: 'some-service', type: 'Bot' })).toBe(true);
  });

  it('detects [bot] suffix in username', () => {
    expect(isBot({ login: 'dependabot[bot]', type: 'User' })).toBe(true);
  });

  it('detects dependabot', () => {
    expect(isBot({ login: 'dependabot', type: 'User' })).toBe(true);
  });

  it('detects renovate', () => {
    expect(isBot({ login: 'renovate-bot', type: 'User' })).toBe(true);
  });

  it('detects github-actions', () => {
    expect(isBot({ login: 'github-actions', type: 'User' })).toBe(true);
  });

  it('does not flag regular users', () => {
    expect(isBot({ login: 'alice', type: 'User' })).toBe(false);
    expect(isBot({ login: 'bob-dev', type: 'User' })).toBe(false);
  });

  it('detects codecov', () => {
    expect(isBot({ login: 'codecov-commenter', type: 'User' })).toBe(true);
  });

  it('detects mergify', () => {
    expect(isBot({ login: 'mergify[bot]', type: 'User' })).toBe(true);
  });
});

describe('parseGitHubActivity', () => {
  it('converts an issue assignment to EngineData', () => {
    const activity = makeActivity();
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });

    expect(result.title).toBe('Fix login bug');
    expect(result.source).toBe('plexus:github');
    expect(result.externalId).toBe('evt-001');
    expect(result.scopes).toEqual(['work.dev.github']);
    expect(result.body).toContain('Issue Assigned');
    expect(result.body).toContain('acme/api');
    expect(result.body).toContain('@alice');
    expect(result.body).toContain('`bug`');
    expect(result.body).toContain('`priority-high`');
    expect(result.body).toContain('v2.0');
  });

  it('converts a merged PR to EngineData with change stats', () => {
    const activity = makePrActivity();
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });

    expect(result.body).toContain('PR Merged');
    expect(result.body).toContain('5 files');
    expect(result.body).toContain('+120');
    expect(result.body).toContain('-30');
  });

  it('includes custom fields for indexing', () => {
    const activity = makeActivity();
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });

    expect(result.customFields?.['event_type']).toBe('issues.assigned');
    expect(result.customFields?.['repo']).toBe('acme/api');
    expect(result.customFields?.['author']).toBe('alice');
    expect(result.customFields?.['is_bot']).toBe(false);
    expect(result.customFields?.['url']).toBe('https://github.com/acme/api/issues/42');
  });

  it('truncates very long bodies', () => {
    const longBody = 'x'.repeat(3000);
    const activity = makeActivity({ body: longBody });
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });

    expect(result.body.length).toBeLessThan(3000);
    expect(result.body).toContain('*(truncated)*');
  });

  it('handles activities with no body', () => {
    const activity = makeActivity({ body: undefined });
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });

    expect(result.body).not.toContain('---');
    expect(result.body).toContain('Issue Assigned');
  });

  it('handles activities with no labels', () => {
    const activity = makeActivity({ labels: undefined });
    const result = parseGitHubActivity(activity, { scopeLabel: 'work.dev.github' });
    expect(result.body).not.toContain('**Labels:**');
  });
});

describe('buildActivityTags', () => {
  it('includes repo, event type, and author', () => {
    const activity = makeActivity();
    const tags = buildActivityTags(activity);

    expect(tags).toContain('repo:acme/api');
    expect(tags).toContain('event:issues.assigned');
    expect(tags).toContain('author:alice');
  });

  it('includes label tags', () => {
    const activity = makeActivity();
    const tags = buildActivityTags(activity);
    expect(tags).toContain('label:bug');
    expect(tags).toContain('label:priority-high');
  });

  it('includes merged tag for merged PRs', () => {
    const activity = makePrActivity();
    const tags = buildActivityTags(activity);
    expect(tags).toContain('merged');
  });

  it('does not include merged tag for non-merged items', () => {
    const activity = makeActivity();
    const tags = buildActivityTags(activity);
    expect(tags).not.toContain('merged');
  });
});

describe('activityMatchesFilter', () => {
  const activity = makeActivity();

  it('matches event_type', () => {
    expect(activityMatchesFilter(activity, 'event_type', 'issues\\.assigned')).toBe(true);
    expect(activityMatchesFilter(activity, 'event_type', 'pull_request')).toBe(false);
  });

  it('matches repo', () => {
    expect(activityMatchesFilter(activity, 'repo', 'acme/api')).toBe(true);
    expect(activityMatchesFilter(activity, 'repo', 'other/repo')).toBe(false);
  });

  it('matches author', () => {
    expect(activityMatchesFilter(activity, 'author', 'alice')).toBe(true);
    expect(activityMatchesFilter(activity, 'author', 'bob')).toBe(false);
  });

  it('matches is_bot', () => {
    expect(activityMatchesFilter(activity, 'is_bot', 'false')).toBe(true);
    expect(activityMatchesFilter(activity, 'is_bot', 'true')).toBe(false);

    const botActivity = makeActivity({
      actor: { login: 'dependabot[bot]', type: 'Bot' },
    });
    expect(activityMatchesFilter(botActivity, 'is_bot', 'true')).toBe(true);
  });

  it('returns false for unknown fields', () => {
    expect(activityMatchesFilter(activity, 'nonexistent', '.*')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GitHubAdapter tests
// ---------------------------------------------------------------------------

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let transport: GitHubTransport;

  beforeEach(() => {
    transport = createMockTransport([makeActivity()]);
    adapter = new GitHubAdapter(transport);
  });

  describe('initialize', () => {
    it('authenticates and transitions to healthy', async () => {
      await adapter.initialize(makeConfig());

      expect(transport.authenticate).toHaveBeenCalledWith('ghp_test_token_12345');
      const status = await adapter.healthCheck();
      expect(status.status).toBe('healthy');
    });

    it('throws on authentication failure', async () => {
      vi.mocked(transport.authenticate).mockRejectedValue(new Error('401 Unauthorized'));

      await expect(adapter.initialize(makeConfig())).rejects.toThrow('authentication failed');
    });

    it('throws when token credential is missing', async () => {
      const config = makeConfig();
      config.credentials = {};

      await expect(adapter.initialize(config)).rejects.toThrow('required credential "token"');
    });
  });

  describe('ingest', () => {
    it('fetches activities and returns EngineData', async () => {
      await adapter.initialize(makeConfig());

      const results = await adapter.ingest({});
      expect(results).toHaveLength(1);
      expect(at(results, 0).source).toBe('plexus:github');
      expect(at(results, 0).title).toBe('Fix login bug');
    });

    it('filters out bot events by default', async () => {
      const botActivity = makeActivity({
        id: 'bot-evt',
        actor: { login: 'dependabot[bot]', type: 'Bot' },
      });
      const humanActivity = makeActivity();

      const mixedTransport = createMockTransport([botActivity, humanActivity]);
      const mixedAdapter = new GitHubAdapter(mixedTransport);
      await mixedAdapter.initialize(makeConfig());

      const results = await mixedAdapter.ingest({});
      expect(results).toHaveLength(1);
      expect(at(results, 0).externalId).toBe('evt-001');
    });

    it('applies custom exclude filters', async () => {
      const activity1 = makeActivity({ repo: 'acme/api' });
      const activity2 = makeActivity({
        id: 'evt-003',
        repo: 'acme/docs',
        createdAt: '2026-04-28T10:00:00Z',
      });

      const filteredTransport = createMockTransport([activity1, activity2]);
      const filteredAdapter = new GitHubAdapter(filteredTransport);
      await filteredAdapter.initialize(makeConfig({ repos: ['*'] }));

      const filters: IngestFilter[] = [{ field: 'repo', pattern: 'acme/docs', type: 'exclude' }];

      const results = await filteredAdapter.ingest({ filters });
      expect(results).toHaveLength(1);
      expect(at(results, 0).customFields?.['repo']).toBe('acme/api');
    });

    it('applies include filters', async () => {
      const prActivity = makePrActivity();
      const issueActivity = makeActivity();

      const typedTransport = createMockTransport([prActivity, issueActivity]);
      const typedAdapter = new GitHubAdapter(typedTransport);
      await typedAdapter.initialize(makeConfig());

      const filters: IngestFilter[] = [
        { field: 'event_type', pattern: 'pull_request', type: 'include' },
      ];

      const results = await typedAdapter.ingest({ filters });
      expect(results).toHaveLength(1);
      expect(at(results, 0).customFields?.['event_type']).toBe('pull_request.merged');
    });

    it('tracks per-repo timestamps for incremental sync', async () => {
      await adapter.initialize(makeConfig());
      await adapter.ingest({});

      const lastFetched = adapter.getLastFetchedPerRepo();
      expect(lastFetched['acme/api']).toBe('2026-04-28T09:00:00Z');
    });

    it('skips already-fetched activities based on per-repo timestamp', async () => {
      await adapter.initialize(makeConfig());

      // First ingest
      await adapter.ingest({});

      // Second ingest with same timestamps — should be skipped
      const results = await adapter.ingest({});
      expect(results).toHaveLength(0);
    });

    it('returns empty array on rate limit error instead of throwing', async () => {
      vi.mocked(transport.fetchActivities).mockRejectedValue(
        new GitHubRateLimitError('Rate limit exceeded', Date.now() / 1000 + 3600)
      );

      await adapter.initialize(makeConfig());
      const results = await adapter.ingest({});
      expect(results).toEqual([]);
    });

    it('rethrows non-rate-limit errors', async () => {
      vi.mocked(transport.fetchActivities).mockRejectedValue(new Error('Network error'));

      await adapter.initialize(makeConfig());
      await expect(adapter.ingest({})).rejects.toThrow('Network error');
    });
  });

  describe('healthCheck', () => {
    it('returns healthy with rate limit metrics', async () => {
      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('healthy');
      expect(status.message).toContain('alice');
      expect(status.metrics?.['rateLimit']).toBe(5000);
      expect(status.metrics?.['rateLimitRemaining']).toBe(4500);
    });

    it('returns degraded when rate limit is below 10%', async () => {
      vi.mocked(transport.getRateLimit).mockResolvedValue({
        limit: 5000,
        remaining: 400, // 8%
        reset: Math.floor(Date.now() / 1000) + 3600,
      });

      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('degraded');
      expect(status.message).toContain('low');
    });

    it('returns degraded when rate limit is exhausted', async () => {
      vi.mocked(transport.getRateLimit).mockResolvedValue({
        limit: 5000,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 3600,
      });

      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('degraded');
      expect(status.message).toContain('exhausted');
    });

    it('returns error when token is invalid', async () => {
      vi.mocked(transport.getRateLimit).mockRejectedValue(new Error('401 invalid token'));

      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('error');
      expect(status.message).toContain('Token invalid');
    });

    it('returns degraded on transient failure', async () => {
      vi.mocked(transport.getRateLimit).mockRejectedValue(new Error('Connection timeout'));

      await adapter.initialize(makeConfig());
      const status = await adapter.healthCheck();

      expect(status.status).toBe('degraded');
    });
  });

  describe('shutdown', () => {
    it('clears per-repo state', async () => {
      await adapter.initialize(makeConfig());
      await adapter.ingest({});

      expect(Object.keys(adapter.getLastFetchedPerRepo()).length).toBeGreaterThan(0);

      await adapter.shutdown();
      expect(adapter.getLastFetchedPerRepo()).toEqual({});
    });
  });

  describe('state persistence', () => {
    it('restores per-repo timestamps from external storage', async () => {
      await adapter.initialize(makeConfig());

      adapter.restoreLastFetchedPerRepo({
        'acme/api': '2026-04-27T00:00:00Z',
        'acme/frontend': '2026-04-26T00:00:00Z',
      });

      const state = adapter.getLastFetchedPerRepo();
      expect(state['acme/api']).toBe('2026-04-27T00:00:00Z');
      expect(state['acme/frontend']).toBe('2026-04-26T00:00:00Z');
    });
  });
});
