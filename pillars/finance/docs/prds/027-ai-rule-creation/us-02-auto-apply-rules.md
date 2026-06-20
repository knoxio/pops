# US-02: ChangeSet proposal loop replaces silent auto-apply

> PRD: [027 — AI Rule Creation](README.md)
> Status: Done

## Description

As a user, I want AI-assisted patterns turned into **reviewable ChangeSet proposals** (PRD-028) so rules never hit the database until I approve them and the import commits (PRD-030 / PRD-031). After approval, remaining rows in the session re-evaluate against the **merged** rule set locally.

## Acceptance Criteria

- [x] AI analysis feeds a correction **signal** used by `proposeChangeSet` (or a deterministic fallback when AI is unavailable).
- [x] The user reviews a bundled ChangeSet in `CorrectionProposalDialog` before any rule write.
- [x] On approval, the ChangeSet is stored in the local pending store and the session re-evaluates uncertain/failed rows using merged DB + pending rules.
- [x] Tab counts update after local re-evaluation.
- [x] Rules become persistent only after **`commitImport`** on Final Review (not mid-session DB writes).
- [x] Rename `autoSaveRuleAndReEvaluate` in `useProposalGeneration.ts` to reflect that it opens the proposal dialog (docs cleanup: knoxio/pops#1746).

## Notes

Supersedes the earlier “auto-save to corrections table at >= 0.8 confidence” wording. See PRD-028 for the authoritative approval model.
