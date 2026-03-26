# US-03: Column mapping step

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to map CSV columns to transaction fields so that the system knows which column is the date, description, amount, and location.

## Acceptance Criteria

- [ ] Auto-detection of common column names (Date, Description, Amount, Location/Town/City)
- [ ] Manual override: dropdown select per field showing all CSV headers
- [ ] Required mappings: date, description, amount
- [ ] Optional mapping: location
- [ ] Preview: shows first few rows with mapped values
- [ ] Client-side parsing per row: date normalization (DD/MM/YYYY → YYYY-MM-DD), amount parsing (remove currency, invert sign), location extraction (first line, title-case), online detection (keyword heuristic), checksum generation (SHA-256 of raw row JSON)
- [ ] Shows first 10 validation errors if rows fail to parse
- [ ] Output: `ParsedTransaction[]` stored in Zustand
- [ ] Advance to Step 3 only when all required columns mapped and parsing succeeds

## Notes

Amount inversion: bank CSVs typically show charges as positive numbers. The system inverts them to negative (expense convention). Income remains positive.
