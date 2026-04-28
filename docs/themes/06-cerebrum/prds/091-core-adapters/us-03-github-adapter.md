# US-03: GitHub Adapter

> PRD: [PRD-091: Core Integration Adapters](README.md)

## Description

As a developer, I want a GitHub adapter that ingests my relevant GitHub activity into engrams so that assigned issues, PR reviews, and meaningful mentions are captured in my knowledge base without the noise of hundreds of daily notifications.

## Acceptance Criteria

- [x] A `GitHubAdapter` class extends `BaseAdapter` and implements `PlexusAdapter` with `ingest()` and `healthCheck()` methods
- [x] `initialize()` authenticates via a GitHub personal access token (resolved from `env:PLEXUS_GITHUB_TOKEN`), validates the token by fetching the authenticated user, and transitions to `healthy` status
- [x] `ingest()` fetches the user's GitHub activity from configured repositories (or all repos if `repos = ["*"]`), filtered to the configured event types, and returns `EngineData[]` with each significant event converted to pre-engram format
- [x] Default event types tracked: `issues.assigned` (issues assigned to the user), `pull_request.review_requested` (PRs where the user's review is requested), `issue_comment.mentioned` (comments mentioning the user), `pull_request.merged` (PRs authored by the user that were merged). Additional event types configurable in plexus.toml
- [x] Event-to-engram conversion: event title (issue/PR title) becomes `title`, event body formatted as Markdown (description, author, labels, linked issues, milestone) becomes `body`, repository name and event type become `tags`, `source` is `plexus:github`, `externalId` is the GitHub event ID, scopes default to the configured `scope_label` (default `work.dev.github`)
- [x] Bot events are excluded by default — events where the actor has `[bot]` in their username or `type: Bot` in their profile are filtered out. This default can be overridden via filters
- [x] PR review requests include the PR description, requested changes (if any), and a link to the PR — the full diff is not ingested (only metadata)
- [x] GitHub API rate limits are handled with exponential backoff: when the rate limit is reached, the adapter logs the reset time, pauses, and resumes when the limit resets. Health check reports remaining rate limit in `metrics`
- [x] `healthCheck()` calls the GitHub API `/rate_limit` endpoint — returns `healthy` with remaining rate limit in metrics, `degraded` if rate limit is below 10% of the hourly limit, `error` if the token is invalid

## Notes

- GitHub generates an enormous volume of events — the adapter must be aggressive about filtering. A developer active on 10+ repos could see 200+ events per day. The default event types are chosen to capture high-signal, personally relevant events and ignore noise.
- The `repos` configuration accepts `owner/repo` format or `*` for all repos where the user has activity. Using `*` with aggressive event type filtering is a reasonable default.
- Consider supporting GitHub webhook delivery as an alternative to polling in the future — webhooks would make the adapter event-driven rather than poll-based.
- The adapter should handle pagination correctly — the GitHub API returns paginated results for activity endpoints. Use the `Link` header for pagination.
- Rate limit metrics in the health check help the user understand their API budget — if they're consistently hitting limits, they need to narrow their repo or event scope.
