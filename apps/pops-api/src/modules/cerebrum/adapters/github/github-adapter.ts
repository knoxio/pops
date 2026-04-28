/**
 * GitHubAdapter — GitHub API activity adapter for Plexus (PRD-091 US-03).
 *
 * Connects via GitHub REST API, fetches issues, PRs, commits, and comments,
 * filters bot noise, and returns EngineData[] for ingestion.
 */
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterStatus,
  type EngineData,
  type IngestOptions,
} from '../types.js';
import {
  isBot,
  parseGitHubActivity,
  type GitHubEventType,
  type RawGitHubActivity,
} from './activity-parser.js';
import {
  buildErrorHealthStatus,
  buildMetrics,
  now,
  passesGitHubFilters,
} from './github-helpers.js';
import {
  FetchGitHubTransport,
  GitHubRateLimitError,
  type GitHubTransport,
} from './github-transport.js';

export { FetchGitHubTransport, GitHubRateLimitError } from './github-transport.js';
export type { GitHubRateLimit, GitHubTransport } from './github-transport.js';

// ---------------------------------------------------------------------------
// Adapter-specific settings
// ---------------------------------------------------------------------------

export interface GitHubAdapterSettings {
  username: string;
  repos: string[];
  events?: GitHubEventType[];
  scopeLabel?: string;
  pollIntervalMinutes?: number;
}

const DEFAULT_EVENT_TYPES: GitHubEventType[] = [
  'issues.assigned',
  'pull_request.review_requested',
  'pull_request.merged',
  'issue_comment.mentioned',
];

// ---------------------------------------------------------------------------
// GitHubAdapter
// ---------------------------------------------------------------------------

export class GitHubAdapter extends BaseAdapter<GitHubAdapterSettings> {
  readonly name = 'github';

  private transport: GitHubTransport;
  private authenticatedUser: string = '';
  private lastFetchedPerRepo = new Map<string, string>();

  constructor(transport?: GitHubTransport) {
    super();
    this.transport = transport ?? new FetchGitHubTransport();
  }

  setTransport(transport: GitHubTransport): void {
    this.transport = transport;
  }

  override async initialize(config: AdapterConfig<GitHubAdapterSettings>): Promise<void> {
    await super.initialize(config);
    const token = this.requireCredential('token');

    try {
      this.authenticatedUser = await this.transport.authenticate(token);
      this.status = 'healthy';
    } catch (err) {
      this.status = 'error';
      throw new Error(
        `GitHubAdapter: authentication failed — ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  override async ingest(options: IngestOptions): Promise<EngineData[]> {
    const config = this.requireConfig();
    const activities = await this.fetchActivitiesFromTransport(config, options);
    const results = this.filterAndConvert(activities, config, options);
    this.updateRepoTimestamps(activities);
    return results;
  }

  override async healthCheck(): Promise<AdapterStatus> {
    try {
      return await this.buildHealthStatus();
    } catch (err) {
      return buildErrorHealthStatus(err);
    }
  }

  override async shutdown(): Promise<void> {
    this.lastFetchedPerRepo.clear();
    this.authenticatedUser = '';
    await super.shutdown();
  }

  getLastFetchedPerRepo(): Record<string, string> {
    return Object.fromEntries(this.lastFetchedPerRepo);
  }

  restoreLastFetchedPerRepo(state: Record<string, string>): void {
    this.lastFetchedPerRepo.clear();
    for (const [repo, timestamp] of Object.entries(state)) {
      this.lastFetchedPerRepo.set(repo, timestamp);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async fetchActivitiesFromTransport(
    config: AdapterConfig<GitHubAdapterSettings>,
    options: IngestOptions
  ): Promise<RawGitHubActivity[]> {
    try {
      return await this.transport.fetchActivities({
        username: config.settings.username || this.authenticatedUser,
        repos: config.settings.repos,
        eventTypes: config.settings.events ?? DEFAULT_EVENT_TYPES,
        since: options.since,
        limit: options.limit,
      });
    } catch (err) {
      if (err instanceof GitHubRateLimitError) {
        this.status = 'degraded';
        return [];
      }
      throw err;
    }
  }

  private filterAndConvert(
    activities: RawGitHubActivity[],
    config: AdapterConfig<GitHubAdapterSettings>,
    options: IngestOptions
  ): EngineData[] {
    const scopeLabel = config.settings.scopeLabel ?? 'work.dev.github';
    const results: EngineData[] = [];

    for (const activity of activities) {
      if (isBot(activity.actor)) continue;
      if (!passesGitHubFilters(activity, options.filters)) continue;
      if (this.isAlreadyFetched(activity)) continue;
      results.push(parseGitHubActivity(activity, { scopeLabel }));
    }

    return results;
  }

  private isAlreadyFetched(activity: RawGitHubActivity): boolean {
    const lastFetched = this.lastFetchedPerRepo.get(activity.repo);
    return !!lastFetched && activity.createdAt <= lastFetched;
  }

  private updateRepoTimestamps(activities: RawGitHubActivity[]): void {
    for (const activity of activities) {
      const current = this.lastFetchedPerRepo.get(activity.repo);
      if (!current || activity.createdAt > current) {
        this.lastFetchedPerRepo.set(activity.repo, activity.createdAt);
      }
    }
  }

  private async buildHealthStatus(): Promise<AdapterStatus> {
    const rateLimit = await this.transport.getRateLimit();
    const pct = ((rateLimit.limit - rateLimit.remaining) / rateLimit.limit) * 100;
    const metrics = buildMetrics(rateLimit, pct, this.lastFetchedPerRepo.size);

    if (rateLimit.remaining === 0) {
      this.status = 'degraded';
      return {
        status: 'degraded',
        message: `Rate limit exhausted — resets at ${new Date(rateLimit.reset * 1000).toISOString()}`,
        lastChecked: now(),
        metrics,
      };
    }
    if (rateLimit.remaining < rateLimit.limit * 0.1) {
      this.status = 'degraded';
      return {
        status: 'degraded',
        message: `Rate limit low: ${rateLimit.remaining}/${rateLimit.limit} remaining`,
        lastChecked: now(),
        metrics,
      };
    }
    this.status = 'healthy';
    return {
      status: 'healthy',
      message: `Authenticated as ${this.authenticatedUser}`,
      lastChecked: now(),
      metrics,
    };
  }
}
