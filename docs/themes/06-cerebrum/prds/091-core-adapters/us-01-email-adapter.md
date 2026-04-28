# US-01: Email Adapter

> PRD: [PRD-091: Core Integration Adapters](README.md)

## Description

As a user, I want an email adapter that connects to my email account via IMAP or API, filters messages by configurable rules, extracts content, and creates engrams so that important emails are automatically captured in my knowledge base.

## Acceptance Criteria

- [x] An `EmailAdapter` class extends `BaseAdapter` and implements `PlexusAdapter` with `ingest()`, `healthCheck()`, and `emit()` methods
- [x] `initialize()` establishes an IMAP connection (or API client for Gmail/Outlook) using credentials resolved from environment variables (`env:PLEXUS_EMAIL_USER`, `env:PLEXUS_EMAIL_PASS`), validates the connection, and transitions to `healthy` status
- [x] `ingest()` fetches emails from configured folders since the last sync timestamp (stored in adapter state), applies ingestion filters (subject patterns, sender patterns, folder restrictions), and returns an `EngineData[]` array with each email converted to pre-engram format
- [x] Email-to-engram conversion: subject becomes `title`, email body (text/plain preferred, HTML stripped to Markdown as fallback) becomes `body`, sender and recipients become `tags`, `source` is `plexus:email`, `externalId` is the email's Message-ID header, scopes default to the configured `scope_label` (e.g., `personal.email` or `work.email`)
- [x] HTML emails are stripped using a sanitiser that converts HTML to clean Markdown — preserving links, lists, headers, and emphasis while removing scripts, styles, and tracking pixels
- [x] Incremental sync tracks the last fetched UID or timestamp per folder — only new emails are fetched on subsequent syncs. The sync cursor is persisted in the adapter's state in the database
- [x] `healthCheck()` verifies the IMAP/API connection is alive by issuing a lightweight command (IMAP NOOP or API ping) — returns `healthy` on success, `degraded` on timeout, `error` on authentication failure
- [x] `emit()` supports sending email summaries: accepts `EmitContent` with title (subject), body (Markdown converted to HTML), and metadata containing `to` addresses — used by the Emit system to send knowledge digests via email

## Notes

- Start with IMAP support as the primary protocol — it works with any email provider. API-specific adapters for Gmail and Outlook can be added as variants later.
- The `folders` config option lets the user specify which IMAP folders to monitor (e.g., `["INBOX", "Work"]`) — default is `["INBOX"]` only.
- Email volume can be high — a user receiving 100+ emails/day needs aggressive filtering. The default setup should include sensible exclude filters (automated notifications, marketing, etc.) documented in the adapter's README or config comments.
- The `emit()` method for email is a secondary feature — primary value is ingestion. Emit enables use cases like "email me a weekly summary of my research notes."
