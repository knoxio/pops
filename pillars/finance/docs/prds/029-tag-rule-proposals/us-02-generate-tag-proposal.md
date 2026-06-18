# US-02: Generate tag rule proposal from tag edits

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Done

## Description

As a user, I want the system to propose tag rules based on my tag edits during import, so that future imports suggest the right tags automatically.

## Acceptance Criteria

- [x] `core.tagRules` implements bundled tag-rule proposal generation with bounded scope (covered by pops-api tests).
- [x] When the user opts to learn from tag edits, the system generates a bundled ChangeSet proposal for tag rules **from Tag Review** — "Save tag rule…" button appears per entity group in Tag Review (knoxio/pops#1886).
- [x] The proposal can include multiple operations (add/edit/disable/remove) **in the import UI flow** — `TagRuleProposalDialog` handles this via `proposeTagRuleChangeSet`.
- [x] Each operation includes rationale and an impact preview for the current import session **in the import UI flow**.
- [x] Proposal scope is bounded to relevant rules and the current import context **in the import UI flow** — all confirmed transactions are passed as preview scope.
- [ ] In an empty database (no existing tag vocabulary), tag suggestions are still generated using the seed taxonomy (v1) as the starting vocabulary **through the wizard**.
- [x] Proposals can be generated from transaction scope signals (single-transaction tag edit) — "Save rule…" button appears per transaction row in Tag Review (knoxio/pops#1928).
