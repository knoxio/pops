# US-15: Type override (transfer/income)

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to mark a transaction as a transfer or income so that it bypasses the entity requirement.

## Acceptance Criteria

- [ ] Type selector on transaction cards: purchase (default), transfer, income
- [ ] Setting type to "transfer" or "income" makes entity optional
- [ ] Transaction moves to matched list even without an entity
- [ ] Type change reflects immediately in the card display (type badge updates)
- [ ] Works on uncertain and failed transactions

## Notes

Transfers between own accounts and income from employers don't need merchant entity matching. This override prevents them from blocking the review gate.
