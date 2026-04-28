# US-02: Calendar Adapter

> PRD: [PRD-091: Core Integration Adapters](README.md)

## Description

As a user, I want a calendar adapter that syncs my calendar events into engrams so that Ego can answer schedule-related questions and my meetings are captured with context in the knowledge base.

## Acceptance Criteria

- [x] A `CalendarAdapter` class extends `BaseAdapter` and implements `PlexusAdapter` with `ingest()` and `healthCheck()` methods
- [x] `initialize()` establishes a CalDAV connection (or API client for Google Calendar/Outlook) using credentials resolved from environment variables, validates access to the configured calendar, and transitions to `healthy` status
- [x] `ingest()` fetches calendar events within a configurable window: `sync_days_behind` (default 7) days in the past to `sync_days_ahead` (default 30) days in the future — returns `EngineData[]` with each event converted to pre-engram format
- [x] Event-to-engram conversion: event title becomes `title`, event description + attendees list + location + video call link become the `body` (formatted as Markdown with clear sections), `source` is `plexus:calendar`, `externalId` is the event UID, scopes default to the configured `scope_label`
- [x] Custom fields on `EngineData` include: `event_start` (ISO 8601), `event_end` (ISO 8601), `location` (string), `attendees` (string array of names/emails), `is_recurring` (boolean) — these are indexed by Thalamus for structured queries and date-range retrieval
- [x] Recurring events are expanded: each occurrence within the sync window creates a separate `EngineData` entry with the specific date — the `externalId` includes the occurrence date to prevent deduplication across occurrences
- [x] Incremental sync: events already ingested (matched by `externalId`) are skipped unless the event has been modified since last sync (detected by comparing the event's `last-modified` property against the stored engram's `modified` timestamp)
- [x] `healthCheck()` validates the CalDAV/API connection by querying the calendar list — returns `healthy` on success, `degraded` on timeout, `error` on authentication failure
- [x] Events with no description produce engrams containing attendees, location, time, and the event title only — the body is not empty, it contains structured event metadata

## Notes

- CalDAV is the standard protocol for calendar access — it works with most calendar servers (Google, Outlook, Fastmail, NextCloud). Start with CalDAV; API-specific variants can follow.
- The `sync_days_ahead` of 30 days ensures Ego can answer questions like "what's my schedule next week?" — but avoid ingesting events too far in the future since they're likely to change.
- Calendar engrams are inherently time-sensitive — consider adding an automatic `stale` transition for past events (e.g., events older than 30 days are marked stale). This could be a built-in reflex or a Glia pruner heuristic.
- The attendees field in custom_fields enables Ego to answer "who was in that meeting about X?" by searching engrams with specific attendees.
