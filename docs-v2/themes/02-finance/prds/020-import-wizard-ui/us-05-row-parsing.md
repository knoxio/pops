# US-05: Client-side row parsing

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a developer, I want each CSV row parsed into a structured ParsedTransaction so that the backend receives clean, normalized data.

## Acceptance Criteria

- [x] Date: DD/MM/YYYY → YYYY-MM-DD normalization
- [x] Amount: strip currency symbols, parse float, invert sign (charges positive → expenses negative)
- [x] Location: extract first line of multiline field, title-case
- [x] Online detection: keyword heuristic (AMAZON, PAYPAL, .COM.AU, NETFLIX, etc.)
- [x] Checksum: SHA-256 hash of full raw CSV row (JSON stringified)
- [x] Raw row preserved as JSON string (audit trail + AI context)
- [x] First 10 validation errors displayed to user
- [x] Invalid rows excluded from output with error message
- [x] Output: `ParsedTransaction[]` stored in Zustand

## Notes

All parsing happens client-side. No server round-trip until Step 3. The checksum is the deduplication key — must be deterministic (same row = same hash every time).
