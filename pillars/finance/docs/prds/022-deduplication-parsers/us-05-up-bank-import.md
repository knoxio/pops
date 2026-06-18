# US-05: Up Bank API batch import

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a user, I want to batch import transactions from Up Bank via API so that my Up account transactions are in POPS without CSV downloads.

## Acceptance Criteria

- [x] Fetches transactions from Up Bank REST API by date range (`SINCE_DATE`)
- [x] Maps Up API response to ParsedTransaction format
- [x] Account from API response (Up Everyday, Up Savers)
- [x] Checksum generated from transaction data for deduplication
- [x] Up Bank API token read from secrets
- [x] Output: valid ParsedTransaction[] compatible with the same pipeline as CSV imports
- [x] Test with mock Up API responses

## Notes

Up Bank is the only API-based source — all others are CSV. The same dedup and matching pipeline applies. Up also supports webhooks for real-time individual transactions.
