## GitHub issues to create (small, parallelisable)

> Purpose: bridge current implementation → greenfield spec in PRD-020/024/027/028/029.

### Issue 1 — Apply corrections in all import processing paths

- **Title**: `fix(finance-import): apply learned corrections in progress processing`
- **Scope**: Ensure corrections are applied consistently during import processing regardless of execution path (foreground vs background progress).
- **Acceptance**:
  - When a correction rule is active, both processing paths match it first and skip subsequent matching stages.
  - Suggested tag attribution remains correct (rule source includes pattern).
  - Unit/integration coverage for both paths.

### Issue 2 — Proposal engine: ChangeSet + impact preview contract

- **Title**: `feat(corrections): define ChangeSet + impact preview contract`
- **Scope**: Introduce a stable data contract for bundled ChangeSets and deterministic impact previews (PRD-028 US-01).
- **Acceptance**:
  - ChangeSet operations: add/edit/disable/remove.
  - Impact preview computed using same matcher used for processing.
  - Atomic apply semantics defined and testable.

### Issue 3 — Proposal generation endpoint (classification rules)

- **Title**: `feat(corrections): generate bundled ChangeSet proposal from correction signal`
- **Scope**: Backend endpoint that generates a ChangeSet proposal with rationale + preview (PRD-028 US-02).
- **Acceptance**:
  - Bounded inputs (relevant rules only).
  - Includes transfer-only outcomes.
  - Produces preview counts + affected list.

### Issue 4 — Approve/apply ChangeSet (atomic) + re-evaluate session

- **Title**: `feat(corrections): approve/apply ChangeSet and re-evaluate import session`
- **Scope**: Apply a ChangeSet atomically and re-run matching for remaining transactions in current import session (PRD-028 US-03).
- **Acceptance**:
  - Approve applies all operations or none.
  - Remaining import items update immediately.

### Issue 5 — Reject-with-feedback and follow-up proposals

- **Title**: `feat(corrections): reject ChangeSet with feedback + follow-up proposal`
- **Scope**: Support required reject message and incorporate feedback into next proposal (PRD-028 US-04).
- **Acceptance**:
  - Rejection persists feedback.
  - Follow-up proposal differs and references feedback.

### Issue 6 — Proposal audit trail

- **Title**: `feat(corrections): record proposal attempts and outcomes`
- **Scope**: Traceability for proposals, approvals, and rejections (PRD-028 US-05).

### Issue 7 — UI: Correction Proposal review modal (bundle approve/reject)

- **Title**: `feat(import-review): correction proposal UI (bundle approve/reject + impact preview)`
- **Scope**: UI for viewing ChangeSet operations, preview, and approve/reject with feedback.

### Issue 8 — UI: Rule transparency on matched transactions

- **Title**: `feat(import-review): show rule provenance on matched transactions`
- **Scope**: Display match source, pattern, match type, confidence for rule-matched transactions (PRD-020).

### Issue 9 — Matched edits trigger proposals (no silent overrides)

- **Title**: `feat(import-review): edits to rule-matched txns trigger ChangeSet proposals`
- **Scope**: Editing a rule-matched transaction triggers ChangeSet proposal flow (PRD-020 US-23).

### Issue 10 — Transfer-only correction support end-to-end

- **Title**: `feat(corrections): support transfer-only rules in matching and proposal flow`
- **Scope**: Rules can classify type=transfer without entity; proposal engine supports creating/editing such rules (PRD-024).

### Issue 11 — Tag rule proposals (separate ruleset)

- **Title**: `feat(tags): tag rule proposals (bundled approve/reject + preview)`
- **Scope**: Implement PRD-029 user stories as a separate ruleset from classification corrections.
