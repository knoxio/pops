# US-01: ChangeSet contract + impact preview contract

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want correction proposals to be explicit and understandable, so that I can safely approve or reject rule changes.

## Acceptance Criteria

- [x] Define a **ChangeSet** as a bundled list of rule operations (add/edit/disable/remove) that is approved or rejected as a single unit.
- [x] Define a canonical **rule model** for classification rules that can express outcomes for:
  - entity assignment (optional)
  - transaction type classification (purchase/transfer/income)
  - location override (optional)
- [x] Define an **impact preview** contract that:
  - is deterministic
  - is computed by the same matching engine used for processing
  - returns counts plus an inspectable list of affected transactions in the current import session
- [x] Define proposal invariants:
  - No ChangeSet can be applied without explicit approval
  - Rejection with feedback applies no changes
  - Applying a ChangeSet is atomic (all operations succeed or none)
