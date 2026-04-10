# US-06: Editable multi-rule proposal with diff editor

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want to inspect and edit every rule operation in a proposed ChangeSet — adding new rules, editing existing or suggested ones, removing anything I don't want — all inside a single diff editor with live impact per operation, so I can land the exact set of rules I want in one pass instead of rejecting and regenerating.

A proposal is not "one rule"; it is a bundled ChangeSet of N operations (add/edit/disable/remove) against the existing rule set (see [US-01](us-01-changeset-contract.md)). The dialog is the diff editor for that ChangeSet.

Rejection with feedback still exists as the "this whole direction is wrong, start over" escape hatch ([US-04](us-04-reject-feedback.md)); day-to-day refinement happens in this editor.

## Dialog Structure

The dialog is a large-surface modal with five regions, all visible at once:

1. **Top — Context panel**: the triggering transaction(s), the user's original correction intent (entity / type / location), and a count of other transactions in the current import that share the signal the proposer picked.

2. **Left — Operations list**: a diff-style list of every operation in the current ChangeSet, ordered and individually selectable. Each row shows:
   - operation kind (`add` / `edit` / `disable` / `remove`)
   - a one-line summary of the rule (pattern + outcome)
   - a per-operation impact count (how many txns in the current import it affects)
   - a staleness marker when the op has unsaved edits
   - a delete control to drop the op from the ChangeSet
   - An **Add operation** control at the bottom of the list appends a new op (add-rule, or edit/disable/remove of an existing rule picked from a searchable list).

3. **Middle — Detail editor**: the editor for the currently selected operation. Fields depend on operation kind:
   - `add` / `edit`: `descriptionPattern`, `matchType` (exact / contains / regex), target entity (existing via picker or new), optional `transactionType`, `location`, `tags`
   - `disable` / `remove`: a read-only view of the target rule plus a rationale field
   - Changing any field marks that operation's impact preview stale and disables Apply until previews are regenerated.

4. **Right — Impact preview**: a live, deterministic list of transactions in the current import session affected by the **selected** operation, grouped by:
   - will change (before → after)
   - already match (rule matches and is already classified that way)
   - unaffected matches (matched but no classification change)
   - A **Combined effect** toggle switches the panel to show the net effect of the entire ChangeSet, so the user can verify overlapping operations resolve the way they expect.
   - A **Re-run preview** action regenerates previews via the same deterministic matcher used in processing.

5. **Bottom — AI helper**: a free-text messaging input with a running transcript of prior exchanges. The helper has full scope over the entire ChangeSet and may:
   - add new operations
   - edit any existing or proposed operation
   - remove any operation
   - split one operation into multiple
   - merge multiple operations into one

   Submitting a message sends the triggering transactions, the full current ChangeSet, and the helper prompt to the proposal engine; the response replaces the ChangeSet with a revised version. The user always sees and can further edit the result — AI never applies directly.

## Actions

| Action | Meaning |
|--------|---------|
| **Cancel** | Close the dialog. No rule changes, no feedback persisted. |
| **Apply** | Apply the current ChangeSet atomically via the US-03 path. Disabled while any operation's preview is stale or the ChangeSet is empty. |
| **Reject with feedback** | Close the dialog, persist rejection feedback for training. Escape hatch only; see [US-04](us-04-reject-feedback.md). |

## Acceptance Criteria

- [ ] The dialog shows the triggering transaction(s) and the user's original correction intent in a dedicated top context panel.
- [ ] The left panel lists every operation in the current ChangeSet with kind, one-line summary, per-op impact count, and staleness state.
- [ ] The user can select any operation in the list to load it into the middle detail editor.
- [ ] The user can add a new operation to the ChangeSet (new rule, or edit/disable/remove of an existing rule selected from a searchable list).
- [ ] The user can delete any operation from the ChangeSet, including operations that were part of the original proposal.
- [ ] The middle detail editor lets the user change `descriptionPattern`, `matchType`, target entity (existing or new), and optional location / type / tags for add/edit operations, and provide a rationale for disable/remove operations.
- [ ] Changing any field in an operation marks that operation's impact preview stale and disables Apply until the preview is regenerated.
- [ ] The right impact panel shows the effect of the currently selected operation, grouped into will-change / already-match / unaffected.
- [ ] The right impact panel has a Combined-effect toggle that shows the net effect of the entire ChangeSet.
- [ ] The user can regenerate previews on demand; regeneration uses the same deterministic matcher as processing.
- [ ] The AI helper accepts free-text instructions and may add, edit, split, merge, or remove any operation in the ChangeSet.
- [ ] AI-revised ChangeSets are never applied automatically — the user must explicitly click Apply.
- [ ] Apply commits the current ChangeSet as a single atomic unit via the US-03 approve-and-apply path.
- [ ] Cancel closes the dialog and applies no rule changes.
- [ ] Reject-with-feedback closes the dialog, persists the feedback, and applies no rule changes.
- [ ] The editor preserves the PRD-028 invariants: no silent learning, bundled decision, deterministic preview, atomic apply.

## Verification

- A proposal that bundles entity + location into one rule can be split, via the AI helper or manually, into two separate operations, previewed independently, and applied as one ChangeSet without ever invoking reject.
- A proposal whose AI-suggested rule overlaps an existing rule can be revised by adding a `disable` operation against the existing rule alongside the new `add`, with the Combined-effect view confirming the net outcome before Apply.
- Starting from an AI-generated ChangeSet of three operations, the user can delete one, edit another, and add a fourth (a transfer-only rule), then apply the result in a single pass.
- The AI helper instruction "exclude online transactions" produces a revised ChangeSet the user can inspect per-operation and edit further before committing.
