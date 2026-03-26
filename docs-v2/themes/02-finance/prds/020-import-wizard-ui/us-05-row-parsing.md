# US-05: Client-side row parsing

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a developer, I want each CSV row parsed into a structured ParsedTransaction so that the backend receives clean, normalized data.

## Acceptance Criteria

- [ ] Date: DD/MM/YYYY → YYYY-MM-DD normalization
- [ ] Amount: strip currency symbols, parse float, invert sign (charges positive → expenses negative)
- [ ] Location: extract first line of multiline field, title-case
- [ ] Online detection: keyword heuristic (AMAZON, PAYPAL, .COM.AU, NETFLIX, etc.)
- [ ] Checksum: SHA-256 hash of full raw CSV row (JSON stringified)
- [ ] Raw row preserved as JSON string (audit trail + AI context)
- [ ] First 10 validation errors displayed to user
- [ ] Invalid rows excluded from output with error message
- [ ] Output: `ParsedTransaction[]` stored in Zustand

## Notes

All parsing happens client-side. No server round-trip until Step 3. The checksum is the deduplication key — must be deterministic (same row = same hash every time).
