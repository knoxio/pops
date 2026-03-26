# US-04: Batch correction analysis

> PRD: [027 — AI Rule Creation](README.md)
> Status: To Review

## Description

As a developer, I want multiple corrections analyzed together so that the AI can identify better patterns from context.

## Acceptance Criteria

- [ ] `corrections.generateRules` accepts batch of 1-50 transactions with their corrections
- [ ] Claude analyzes the batch and returns pattern proposals
- [ ] Batch context helps: two corrections for "IKEA TEMPE" and "IKEA RHODES" → stronger "IKEA" prefix confidence
- [ ] Proposals are not auto-saved — caller confirms via createOrUpdate
- [ ] Works alongside per-correction analysis (US-01) — batch runs periodically during review step
- [ ] Cost tracked as single AI call, not per transaction

## Notes

Batch analysis runs in the background during the review step. Individual corrections (US-01) provide immediate feedback. Batch analysis provides refined suggestions as more corrections accumulate.
