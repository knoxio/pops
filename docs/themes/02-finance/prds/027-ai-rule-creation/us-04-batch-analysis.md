# US-04: Batch correction analysis

> PRD: [027 — AI Rule Creation](README.md)
> Status: Done

## Description

As a developer, I want multiple corrections analyzed together so that the AI can identify better patterns from context.

## Acceptance Criteria

- [x] `corrections.generateRules` accepts batch of 1-50 transactions with their corrections
- [x] Claude analyzes the batch and returns pattern proposals
- [x] Batch context helps: two corrections for "IKEA TEMPE" and "IKEA RHODES" → stronger "IKEA" prefix confidence
- [x] Proposals are not auto-saved — caller confirms via createOrUpdate
- [x] Works alongside per-correction analysis (US-01) — batch runs periodically during review step
- [x] Cost tracked as single AI call, not per transaction

## Notes

Batch analysis runs in the background during the review step. Individual corrections (US-01) provide immediate feedback. Batch analysis provides refined suggestions as more corrections accumulate.
