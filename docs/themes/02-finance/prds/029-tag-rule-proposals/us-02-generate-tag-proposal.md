# US-02: Generate tag rule proposal from tag edits

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Not started

## Description

As a user, I want the system to propose tag rules based on my tag edits during import, so that future imports suggest the right tags automatically.

## Acceptance Criteria

- [ ] When the user opts to learn from tag edits, the system generates a bundled ChangeSet proposal for tag rules.
- [ ] The proposal can include multiple operations (add/edit/disable/remove).
- [ ] Each operation includes rationale and an impact preview for the current import session.
- [ ] Proposal scope is bounded to relevant rules and the current import context.
- [ ] In an empty database (no existing tag vocabulary), tag suggestions are still generated using the seed taxonomy (v1) as the starting vocabulary.
- [ ] Proposals can be generated from either:
  - transaction scope signals (single-transaction tag edit)
  - group scope signals (entity-group tag edits / acceptance in Tag Review)

