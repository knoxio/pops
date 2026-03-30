# US-03: Column mapping step

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to map CSV columns to transaction fields so that the system knows which column is the date, description, amount, and location.

## Acceptance Criteria

- [x] Auto-detection of common column names (Date, Description, Amount, Location/Town/City)
- [x] Manual override: dropdown select per field showing all CSV headers
- [x] Required mappings: date, description, amount
- [x] Optional mapping: location
- [x] Preview: shows first few rows with mapped values
- [x] Client-side parsing per row: date normalization (DD/MM/YYYY → YYYY-MM-DD), amount parsing (remove currency, invert sign), location extraction (first line, title-case), online detection (keyword heuristic), checksum generation (SHA-256 of raw row JSON)
- [x] Shows first 10 validation errors if rows fail to parse
- [x] Output: `ParsedTransaction[]` stored in Zustand
- [x] Advance to Step 3 only when all required columns mapped and parsing succeeds

## Notes

Amount inversion: bank CSVs typically show charges as positive numbers. The system inverts them to negative (expense convention). Income remains positive.
