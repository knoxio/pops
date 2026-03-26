# US-04: Manual column mapping UI

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to manually select which CSV column maps to each transaction field so that I can correct auto-detection mistakes.

## Acceptance Criteria

- [ ] Dropdown select per required field (date, description, amount) showing all CSV headers
- [ ] Dropdown for optional field (location)
- [ ] Pre-filled from auto-detection results (US-03)
- [ ] Preview table showing first few rows with mapped values
- [ ] Cannot advance until all required fields mapped
- [ ] Clear visual indicator of unmapped required fields

## Notes

Auto-detection (US-03) pre-fills. This US provides the override UI. Both can be built in parallel.
