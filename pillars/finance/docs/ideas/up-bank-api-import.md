# Idea: Up Bank API import (batch + webhook persistence)

> Status: Partial scaffold only. A signature-verified webhook endpoint exists (`POST /webhooks/up`, `POST /webhooks/up/ping`) but it only logs the event — it does not fetch the transaction or persist anything. There is no API batch import.

## Problem

Up Bank has no CSV export worth importing through the column-mapping flow; it has a REST API and webhooks. Today neither path lands a transaction in the finance DB. The webhook handler verifies `X-Up-Authenticity-Signature` (HMAC-SHA256 of the raw body) and returns `200 { received: true }`, then drops the event.

## Proposed work

### Batch import by date range

- Fetch transactions from the Up Bank REST API since a configurable date.
- Read the Up API token from a secret (file or env), like the webhook secret.
- Map each Up transaction to `ParsedTransaction` (`account` from the API: Up Everyday, Up Savers).
- Generate the same SHA-256 checksum so the existing dedup pipeline applies — re-running a date range or overlapping with the webhook never double-inserts.
- Feed the result into the same `/imports/process` → `/imports/commit` pipeline as CSV imports.

### Webhook persistence

- On `TRANSACTION_CREATED` events, fetch the referenced transaction by id, map to `ParsedTransaction`, dedup by checksum, and insert — instead of only logging.

## Acceptance criteria (when built)

- [ ] Batch fetch from Up API by date range produces `ParsedTransaction[]` compatible with the existing pipeline.
- [ ] Account derived from the Up API response, not hardcoded.
- [ ] Up API token sourced from a secret.
- [ ] Checksum dedup prevents webhook + batch overlap from double-inserting the same transaction.
- [ ] Webhook handler persists `TRANSACTION_CREATED` events (currently a no-op log).
- [ ] Tests with mocked Up API responses and signed webhook payloads.

## Notes

The webhook is a deliberately raw Express route (not a ts-rest contract route) because Up signs the exact request bytes; the app factory registers a path-scoped `express.raw()` ahead of the global `express.json()`. Keep that when adding persistence.
