# US-02: Generate bundled proposal from correction signal

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Not started

## Description

As a user, I want the system to propose the right generalisation when I correct a transaction, so that the rules it suggests match the same merchant/counterparty without being overly specific or overly broad.

## Acceptance Criteria

- [ ] When the user triggers Save & Learn, the system generates a **bundled ChangeSet proposal**.
- [ ] Proposal generation uses:
  - the corrected transaction(s)
  - the user’s intended correction
  - a bounded set of relevant existing rules
  - optional rejection feedback (when present)
- [ ] The proposal can include multiple operations in one bundle, including combinations of:
  - adding a new rule
  - editing an existing rule (narrow/broaden)
  - disabling/removing an existing rule that causes incorrect matches
- [ ] Each operation includes a brief rationale and the proposed confidence/activation semantics.
- [ ] The response includes an impact preview for the current import session.

