# PRD-091: Core Integration Adapters

> Epic: [07 — Plexus](../../epics/07-plexus.md)
> Status: Not started

## Overview

Build three reference implementations of the Plexus adapter interface (PRD-090): email (IMAP/API ingestion with filtering), calendar (CalDAV/API sync with schedule-aware context), and GitHub (API with activity filtering). These adapters demonstrate the adapter pattern, provide immediate value by connecting Cerebrum to the user's most active data sources, and serve as templates for future adapter development.

## Data Model

### Adapter-Specific Filterable Fields

| Adapter  | Filterable Fields                                         | Description                             |
| -------- | --------------------------------------------------------- | --------------------------------------- |
| Email    | `subject`, `from`, `to`, `cc`, `folder`, `has_attachment` | Email header fields and folder location |
| Calendar | `calendar_name`, `category`, `organizer`, `is_recurring`  | Calendar event metadata                 |
| GitHub   | `event_type`, `repo`, `author`, `action`, `is_bot`        | GitHub event properties                 |

### Adapter Default Scopes

| Adapter  | Default Scope                          | Logic                                             |
| -------- | -------------------------------------- | ------------------------------------------------- |
| Email    | `personal.email` or `work.email`       | Based on configured account label in plexus.toml  |
| Calendar | `personal.calendar` or `work.calendar` | Based on configured calendar label in plexus.toml |
| GitHub   | `work.dev.github`                      | All GitHub activity defaults to work dev scope    |

## API Surface

No new procedures — adapters are managed through the Plexus adapter API (PRD-090). Each adapter implements the `PlexusAdapter` interface and is registered via `cerebrum.plexus.adapters.register`.

| Adapter-Specific Config (plexus.toml) | Fields                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Email                                 | `protocol` (imap/api), `host`, `port`, `tls`, `folders` (array of folders to monitor), `scope_label` (personal/work)                         |
| Calendar                              | `protocol` (caldav/api), `url`, `scope_label` (personal/work), `sync_days_ahead` (default 30), `sync_days_behind` (default 7)                |
| GitHub                                | `token` (env: reference), `username`, `repos` (array of owner/repo, or `*` for all), `events` (array of event types to track), `scope_label` |

## Business Rules

- All three adapters extend `BaseAdapter` (PRD-090) and implement `ingest()` and `healthCheck()`. The email adapter also implements the optional `emit()` method for sending email summaries — calendar and GitHub adapters do not implement `emit()`
- Email adapter connects via IMAP (or API for providers like Gmail) and polls configured folders at a configurable interval (default every 15 minutes). Each email is converted to an engram with: subject as title, email body (text/plain or stripped HTML) as Markdown body, sender/recipients as tags, and the configured scope
- Email adapter tracks the last synced UID/timestamp per folder to enable incremental sync — only new emails since the last sync are fetched
- Calendar adapter connects via CalDAV (or API for Google Calendar, Outlook) and syncs events within a configurable window (default 7 days behind to 30 days ahead). Each event becomes an engram with: event title as title, description + attendees + location as body, event date/time in frontmatter custom fields, and the configured scope
- Calendar adapter provides schedule-aware context for Ego: when Ego receives a question like "what's my week look like?", Thalamus retrieves calendar engrams for the relevant date range
- GitHub adapter connects via the GitHub REST API and fetches the user's activity: assigned issues, PR reviews requested, mentions in issues/comments, and repository events. Each significant event becomes an engram with the event details formatted as Markdown
- GitHub adapter filters noise by default — bot events, CI notifications, and bulk automated events (dependabot, etc.) are excluded unless explicitly included via filters. The adapter ships with a default exclude filter: `{ field: "is_bot", pattern: "true" }`
- All adapters set `source: 'plexus:{adapter_name}'` on all `EngineData` items — e.g., `plexus:email`, `plexus:calendar`, `plexus:github`
- All adapters provide an `externalId` on `EngineData` for deduplication: email uses Message-ID, calendar uses event UID, GitHub uses event ID
- Adapters handle rate limits gracefully — GitHub API rate limits trigger exponential backoff; email/calendar connections handle transient failures with retry

## Edge Cases

| Case                                      | Behaviour                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email with no text body (HTML only)       | HTML is stripped to plain text using a sanitiser, then converted to Markdown                       |
| Email with attachments                    | Attachment filenames listed in the engram body — attachment content is not ingested (out of scope) |
| Calendar event with no description        | Engram body contains attendees, location, and time only — title is the event title                 |
| Calendar recurring event                  | Each occurrence within the sync window creates a separate engram with the specific date            |
| GitHub event for a repo not in the config | Skipped — only configured repos (or all repos if `*`) are tracked                                  |
| GitHub rate limit reached                 | Sync pauses with exponential backoff, resumes when rate limit resets — logged                      |
| IMAP connection dropped mid-sync          | Sync fails gracefully, adapter status transitions to `degraded`, retries next cycle                |
| CalDAV server returns 401                 | Adapter transitions to `error`, user notified to check credentials                                 |
| Email from a `.secret.` configured sender | If scope rules map the sender to a secret scope, the engram receives that scope                    |
| GitHub PR review with 500+ line diff      | Only the PR metadata (title, description, author, labels) is ingested, not the full diff           |

## User Stories

| #   | Story                                               | Summary                                                                 | Status      | Parallelisable |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------- | ----------- | -------------- |
| 01  | [us-01-email-adapter](us-01-email-adapter.md)       | IMAP/API email ingestion: connect, filter, extract, create engrams      | Not started | Yes            |
| 02  | [us-02-calendar-adapter](us-02-calendar-adapter.md) | CalDAV/API calendar sync: import events, schedule-aware context for Ego | Not started | Yes            |
| 03  | [us-03-github-adapter](us-03-github-adapter.md)     | GitHub API: ingest filtered activity, skip noise, create engrams        | Not started | Yes            |

All three adapters are independent implementations of the same interface and can be built in parallel. Each depends on PRD-090 (Plugin Architecture) being implemented.

## Verification

- The email adapter connects to a configured IMAP account, fetches new emails, and creates engrams with correct scopes and tags
- Subsequent email syncs only fetch emails newer than the last sync — no duplicates
- Email filters exclude messages matching the exclude pattern (e.g., JIRA notifications)
- The calendar adapter syncs events for the configured window and creates engrams with event metadata in custom fields
- Asking Ego "what meetings do I have tomorrow?" retrieves calendar engrams for the correct date range
- The GitHub adapter fetches assigned issues and PR reviews, creates engrams with formatted Markdown, and skips bot events
- All three adapters handle connection failures gracefully — status transitions to `degraded` or `error` without crashing other adapters
- `externalId` deduplication prevents the same email, event, or GitHub activity from being ingested twice
- Health checks pass for all three adapters when properly configured and connected

## Out of Scope

- Adapter-specific UI configuration screens (configuration via plexus.toml)
- OAuth consent flows (credentials are configured directly via environment variables)
- Email attachment content ingestion (filenames only — full attachment handling is future work)
- Real-time push notifications from external sources (adapters poll on configurable intervals)
- Adapters beyond the three reference implementations (community or future work)
- Two-way calendar sync (creating calendar events from engrams — emit direction is future)

## Drift Check

last checked: never
