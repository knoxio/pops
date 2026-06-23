# Idea: Core Integration Adapters (email / calendar / GitHub)

Forward-looking. The Plexus plugin architecture is built: cerebrum ships the `PlexusAdapterInterface` + `BaseAdapter` base class, the `PlexusLifecycleManager` (register → initialize → health-loop → shutdown, with error isolation and a consecutive-failure threshold), ingestion-filter evaluation, the adapter/filter DB tables in cerebrum's own SQLite DB, the REST surface under `/plexus/adapters` (`list`, `get`, `health-check`, `sync`, `unregister`, `filters` list/set), and the in-app Plexus admin pages. What is **not** built is a single concrete adapter — the registry boots empty and adapters are registered out-of-band. No IMAP/CalDAV/GitHub client, no TOML registry/file-watcher, and no `plexus.toml`-driven config resolution exist yet.

Build later: three reference adapters that each implement `PlexusAdapterInterface`, register through `PlexusLifecycleManager`, and emit `EngineData[]` from `ingest()`. Each item must set `externalId` for dedup; the lifecycle manager already stamps `source: plexus:{name}` on every item, so adapters should not hard-code it. Ingested items become engrams in cerebrum's own DB via the ingestion pipeline.

Cross-cutting requirements for all three:

- Credentials resolve from environment-variable references (e.g. `env:PLEXUS_EMAIL_USER`), never inline secrets.
- `healthCheck()` returns `healthy` / `degraded` / `error` with adapter-specific `metrics`; the lifecycle manager already drives the periodic loop and the on-demand `/health-check` endpoint.
- Transient failures degrade gracefully (status `degraded`/`error`) without crashing sibling adapters.
- A TOML registry + file-watcher to populate the lifecycle manager at boot from `plexus.toml`, replacing today's out-of-band registration.

## Email adapter

- `EmailAdapter extends BaseAdapter`, implements `ingest()`, `healthCheck()`, and the optional `emit()`.
- `initialize()` opens an IMAP connection (API client for Gmail/Outlook as a later variant) from `env:PLEXUS_EMAIL_USER` / `env:PLEXUS_EMAIL_PASS`, validates, → `healthy`.
- `ingest()` fetches from configured `folders` (default `["INBOX"]`) since the last sync, applies subject/sender/folder filters, returns `EngineData[]`. Subject → `title`; text/plain body (HTML stripped to clean Markdown — keep links/lists/headers/emphasis, drop scripts/styles/tracking pixels) → `body`; sender + recipients → `tags`; `externalId` = Message-ID; default scope `personal.email` / `work.email` from `scope_label`.
- Incremental sync persists the last UID/timestamp **per folder** in adapter state (cerebrum DB) — only new mail on subsequent syncs.
- `healthCheck()`: IMAP NOOP / API ping → `healthy`, timeout → `degraded`, auth failure → `error`.
- `emit()`: send a summary email — `EmitContent` title → subject, Markdown body → HTML, `metadata.to` → recipients (knowledge-digest use case).
- Config: `protocol` (imap/api), `host`, `port`, `tls`, `folders[]`, `scope_label`. Ship sensible default exclude filters for automated/marketing noise.

## Calendar adapter

- `CalendarAdapter extends BaseAdapter`, implements `ingest()` and `healthCheck()` (no `emit()`).
- `initialize()` opens a CalDAV connection (Google/Outlook API as a later variant), validates calendar access, → `healthy`.
- `ingest()` syncs a window: `sync_days_behind` (default 7) to `sync_days_ahead` (default 30). Title → `title`; description + attendees + location + video-call link → Markdown `body` (clear sections; non-empty even with no description); `externalId` = event UID; default scope from `scope_label`.
- `customFields`: `event_start` / `event_end` (ISO 8601), `location`, `attendees[]`, `is_recurring` — indexed by Thalamus for date-range and attendee queries, enabling Ego to answer "what meetings do I have tomorrow?" and "who was in that meeting about X?".
- Recurring events expand: one `EngineData` per occurrence in-window, occurrence date folded into `externalId` so occurrences don't collapse.
- Incremental sync: skip already-ingested events (by `externalId`) unless the event's `last-modified` is newer than the stored engram's `modified`.
- `healthCheck()`: query the calendar list → `healthy` / `degraded` / `error`.
- Config: `protocol` (caldav/api), `url`, `scope_label`, `sync_days_ahead`, `sync_days_behind`.

## GitHub adapter

- `GitHubAdapter extends BaseAdapter`, implements `ingest()` and `healthCheck()`.
- `initialize()` authenticates with a PAT from `env:PLEXUS_GITHUB_TOKEN`, validates by fetching the authenticated user, → `healthy`.
- `ingest()` fetches activity from configured `repos` (or `["*"]` for all), filtered to configured `events`, paginated via the `Link` header. Default event types: `issues.assigned`, `pull_request.review_requested`, `issue_comment.mentioned`, `pull_request.merged`. Title (issue/PR title) → `title`; Markdown body (description, author, labels, linked issues, milestone) → `body`; repo name + event type → `tags`; `externalId` = GitHub event ID; default scope `work.dev.github`.
- Bot events excluded by default (actor username contains `[bot]` or profile `type: Bot`); overridable via filters.
- PR review requests carry description + requested changes + link — metadata only, never the full diff.
- Rate limits: exponential backoff on hit, log the reset time, resume on reset. `healthCheck()` calls `/rate_limit` → `healthy` (remaining in `metrics`), `degraded` below 10% of the hourly limit, `error` on invalid token.
- Config: `token` (env ref), `username`, `repos[]` (`owner/repo` or `*`), `events[]`, `scope_label`.

## Edge cases (all adapters)

- Email HTML-only → sanitise to Markdown; attachments → filenames listed in body, content not ingested.
- Calendar event with no description → body still holds attendees/location/time/title.
- GitHub event for an unconfigured repo → skipped; PR with a 500+ line diff → metadata only.
- IMAP dropped mid-sync → `degraded`, retry next cycle. CalDAV 401 → `error`, notify to check credentials.
- Sender mapped to a `.secret.` scope by scope rules → engram receives that secret scope.

## Out of scope (when this is picked up)

- Per-adapter UI config screens (config stays in `plexus.toml`); OAuth consent flows; attachment-content ingestion; real-time push (poll only); two-way calendar sync (creating events from engrams).

These three reference adapters target the Plexus adapter contract that lives in this pillar. The TOML-driven config resolution they assume is itself unbuilt — see `plexus-toml-registry.md`.
