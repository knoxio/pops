# US-15: Type override (transfer/income)

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to mark a transaction as a transfer or income so that it bypasses the entity requirement.

## Acceptance Criteria

- [x] Type selector on transaction cards: purchase (default), transfer, income
- [x] Setting type to "transfer" or "income" makes entity optional
- [x] Transaction moves to matched list even without an entity
- [x] Type change reflects immediately in the card display (type badge updates)
- [x] Works on uncertain and failed transactions

## Notes

Transfers between own accounts and income from employers don't need merchant entity matching. This override prevents them from blocking the review gate.
