# PRD-028: Correction Proposal Engine

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: Partial

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

- A full UI for browsing and managing all rules outside the import wizard
- Automatic, silent rule edits without explicit user approval
- Tag rule learning (specified separately in PRD-029)

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

When the user triggers Save & Learn or edits a rule-matched transaction, the system generates a bundled ChangeSet proposal.

The proposal UI must show:

- the list of rule operations in the ChangeSet
- an impact preview (count + inspectable list) for this import
- explicit **Approve** and **Reject** actions

### Approval

On approval:

- the ChangeSet is applied atomically
- the import review re-evaluates remaining transactions using the same rules engine as processing
- newly matched transactions are surfaced immediately

### Rejection with feedback

On rejection:

- the user must provide a short feedback message
- the system can generate a follow-up ChangeSet proposal using that feedback
- rejected proposals do not apply any rule changes

## Business Rules

- **No silent learning**: rule changes always require explicit approval.
- **Bundled decision**: proposals are approved/rejected as a bundle.
- **Deterministic preview**: impact preview must be computed by the same matching engine used for processing.
- **Transfer-only learning supported**: rules may classify a transaction as transfer/income without requiring an entity.
- **Scope control**: proposal generation must be bounded (avoid sending unbounded rule sets or unbounded transaction histories).

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Proposal has zero impact in current import | Still allowed; UI must make that clear. |
| Proposal is overly broad | User rejects with feedback; follow-up proposal must narrow scope. |
| Multiple rules already match | Proposal may suggest disabling one or increasing specificity; impact preview must show net effect. |
| AI unavailable | The system can still offer a non-AI rule proposal flow, but must preserve the approval model and previews. |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-changeset-contract](us-01-changeset-contract.md) | Define ChangeSet schema, impact preview contract, and invariants | Not started | No (first) |
| 02 | [us-02-generate-proposal](us-02-generate-proposal.md) | Generate bundled ChangeSet proposal from a correction signal | Not started | Blocked by us-01 |
| 03 | [us-03-approve-apply](us-03-approve-apply.md) | Approve and apply ChangeSet atomically, then re-evaluate remaining transactions | Not started | Blocked by us-01 |
| 04 | [us-04-reject-feedback](us-04-reject-feedback.md) | Reject with required feedback, produce follow-up proposal that incorporates feedback | Not started | Blocked by us-01 |
| 05 | [us-05-audit-trail](us-05-audit-trail.md) | Record proposal attempts and outcomes for traceability | Done | Blocked by us-01 |

## Verification

- A correction like “WOOLWORTHS 12837192” → “Woolworths” produces a proposal that generalises correctly and matches other Woolworths variants in the same import after approval.
- A transfer correction (e.g. PayID) can produce a rule that classifies similar rows as transfer without an entity.
- A wrong rule match can be corrected via edit, resulting in a ChangeSet proposal that fixes the rule system rather than silently overriding the one transaction.

