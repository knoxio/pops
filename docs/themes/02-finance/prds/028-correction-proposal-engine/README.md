# PRD-028: Correction Proposal Engine

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: Done

## Overview

Build a proposal engine that turns user corrections during import review into explicit, reviewable rule changes. The system must be:

- **User-controlled**: rules never change without approval
- **Transparent**: the user can see what rule changes are proposed and what they will affect
- **Safe**: proposals are applied atomically and can be rejected with feedback
- **Fast**: approval immediately reduces remaining manual work in the current import

This PRD defines the mechanism and user contract for proposing, approving, rejecting, and applying rule ChangeSets.

## Problem

Manual correction work during import is repetitive. A “learning” system is only useful if it:

- learns the right generalisation (e.g. “WOOLWORTHS” not “WOOLWORTHS 12837192”)
- does not silently create overly broad rules
- is correctable when rules make mistakes

## Definitions

- **Correction signal**: a user action that indicates the current match/classification is wrong (e.g. changing entity, changing type to transfer, changing location override).
- **Rule**: a persisted pattern that can match new transactions and apply a classification outcome.
- **ChangeSet**: a bundled list of rule operations proposed by the engine (add/edit/disable/remove), presented to the user as a single approval decision.
- **Impact preview**: a deterministic preview showing which transactions would change if the ChangeSet were applied.

## Non-Goals

- Automatic, silent rule edits without explicit user approval
- Tag rule learning (specified separately in PRD-029)

> **Note:** A full UI for browsing and managing all rules was previously a non-goal. It is now in scope — see PRD-032 (Global Rule Manager & Priority Ordering) which adds a browse mode to CorrectionProposalDialog.

## Inputs

The proposal engine takes:

- **The transaction(s) being corrected**
  - description, amount, account, location (if present), raw row metadata
- **The user’s intended correction**
  - entity assignment and/or transaction type and/or location override
- **Relevant existing rules**
  - bounded to a set that is relevant to the correction (e.g. rules that match the transaction now, plus candidate rules that nearly match)
- **Optional user feedback**
  - if generating a follow-up proposal after rejection

## Outputs

The proposal engine returns a **bundled ChangeSet** containing a list of operations. Each operation includes:

- operation type: add / edit / disable / remove
- proposed rule pattern and match type
- proposed confidence / activation semantics
- intended outcome (entity / type / location)
- rationale text

The response also includes an **impact preview** for the current import session.

## User Experience Contract

### Proposal creation

When the user triggers Save & Learn or edits a rule-matched transaction, the system generates a bundled ChangeSet proposal. A proposal is always a **set of N rule operations** (add/edit/disable/remove), never a single rule — even the simplest cases are modelled as a ChangeSet of one.

The proposal UI must show:

- the triggering transaction(s) and the user's original correction intent
- the full list of rule operations in the ChangeSet, individually selectable and editable
- a deterministic impact preview per operation, plus a combined-effect view for the whole ChangeSet
- an AI helper with full scope over the entire ChangeSet
- explicit **Cancel**, **Apply**, and **Reject with feedback** actions

### Editable refinement (primary path)

The proposal dialog is a diff editor for the ChangeSet. The user refines it in place:

- the operations list lets the user inspect, select, add, and delete any operation — including operations that target existing rules (`edit` / `disable` / `remove`) and operations that propose new rules (`add`)
- a detail editor lets the user change pattern, match type, target entity, and optional attributes on the currently selected operation without closing the dialog
- editing any field marks that operation's impact preview stale; previews can be regenerated on demand using the same deterministic matcher as processing
- the impact preview can be scoped to a single selected operation or to the combined net effect of the whole ChangeSet
- the AI helper accepts free-text instructions and may add, edit, split, merge, or remove any operation in the ChangeSet ("make it broader", "split location into its own rule", "disable the old IKEA rule", "exclude transfers")
- AI-revised ChangeSets are never applied automatically

### Approval

On approval (Apply):

- the ChangeSet is stored in the local pending ChangeSet store (PRD-030 US-06) — no DB write occurs at this stage
- the import review re-evaluates remaining transactions against the merged rule set (DB rules + all pending ChangeSets) using the local re-evaluation engine (PRD-030 US-07)
- newly matched transactions are surfaced immediately
- all pending ChangeSets are committed atomically in Step 6 (PRD-031)

### Rejection with feedback (escape hatch)

Rejection is reserved for the "this whole direction is wrong, start over" case — day-to-day refinement uses the editor and AI helper. On rejection:

- the user must provide a short feedback message
- the dialog closes
- the rejection is persisted for training/audit
- no rule changes are applied

## Business Rules

- **No silent learning**: rule changes always require explicit approval.
- **Bundled decision**: proposals are approved/rejected as a bundle.
- **Deterministic preview**: impact preview must be computed by the same matching engine used for processing, using the merged rule set (DB + pending ChangeSets) as the baseline (PRD-030 US-08).
- **Transfer-only learning supported**: rules may classify a transaction as transfer/income without requiring an entity.
- **Scope control**: proposal generation must be bounded (avoid sending unbounded rule sets or unbounded transaction histories).

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Proposal has zero impact in current import | Still allowed; UI must make that clear. |
| Proposal is overly broad | User narrows it in place via the editor or AI helper ([US-06](us-06-editable-proposal.md)). Reject-with-feedback is reserved for "this whole direction is wrong, start over". |
| Multiple rules already match | Proposal may include `disable`/`edit` operations alongside new `add` operations; the combined-effect preview must show the net outcome before Apply. |
| User edits an AI suggestion, then asks AI to revise again | Revise call receives the current (user-edited) ChangeSet plus the new instruction; the AI may further edit, add, split, merge, or remove any operation. |
| AI unavailable | The system can still offer a non-AI rule proposal flow, but must preserve the approval model and previews. |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-changeset-contract](us-01-changeset-contract.md) | Define ChangeSet schema, impact preview contract, and invariants | Done | No (first) |
| 02 | [us-02-generate-proposal](us-02-generate-proposal.md) | Generate bundled ChangeSet proposal from a correction signal | Done | Blocked by us-01 |
| 03 | [us-03-approve-apply](us-03-approve-apply.md) | Approve and apply ChangeSet atomically, then re-evaluate remaining transactions | Done | Blocked by us-01 |
| 04 | [us-04-reject-feedback](us-04-reject-feedback.md) | Reject with required feedback, persist rejection for training/audit | Done | Blocked by us-01 |
| 05 | [us-05-audit-trail](us-05-audit-trail.md) | Record proposal attempts and outcomes for traceability | Done | Blocked by us-01 |
| 06 | [us-06-editable-proposal](us-06-editable-proposal.md) | Editable proposal dialog with live impact preview and AI helper for in-place refinement | Done | Blocked by us-01, us-02 |
| 07 | [us-07-trigger-context-and-prompt](us-07-trigger-context-and-prompt.md) | Reframe proposal prompt around "how to match future txns" and surface the triggering transaction in the dialog | Done | Blocked by us-02, us-06 |

## Verification

- A correction like “WOOLWORTHS 12837192” → “Woolworths” produces a proposal that generalises correctly and matches other Woolworths variants in the same import after approval.
- A transfer correction (e.g. PayID) can produce a rule that classifies similar rows as transfer without an entity.
- A wrong rule match can be corrected via edit, resulting in a ChangeSet proposal that fixes the rule system rather than silently overriding the one transaction.

