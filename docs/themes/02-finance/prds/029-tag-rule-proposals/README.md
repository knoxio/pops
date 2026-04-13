# PRD-029: Tag Rule Proposals

> Epic: [03 — Corrections](../../epics/03-corrections.md)
> Status: Partial

## Overview

Build a tag learning system that proposes reusable **tag rules** based on user tag edits during import. Tag rules help the system suggest consistent categories over time, while remaining safe and user-controlled.

This PRD is intentionally separate from classification corrections (PRD-024) so that:

- entity/type matching remains stable and explainable
- tagging can improve without risking incorrect entity assignments

Tag rule changes follow the same proposal contract as PRD-028:

- bundled ChangeSet proposals
- deterministic impact preview
- approve to apply, reject with feedback

## Non-Goals

- Using tag edits to change entity/type rules
- Silent rule changes without approval
- A full rules management UI outside the import flow

## Inputs

- one or more transactions with user-confirmed tags (and optionally entity/type context)
- current tag vocabulary (existing tags) and an optional **seed taxonomy** for new installs / empty databases
- bounded set of relevant existing tag rules
- optional rejection feedback

## Outputs

- a bundled ChangeSet of tag rule operations (add/edit/disable/remove)
- an impact preview for the current import session (which transactions’ suggested tags would change)

## Seeded taxonomy + new tags (required)

The system must support high-quality tag suggestions even when the database contains no prior tags.

- A default **seed taxonomy** must be available for an empty or near-empty database.
- AI may propose tags from the seeded taxonomy and may also propose **brand-new tags**.
- Brand-new tags must be clearly marked as **New** and require explicit acceptance before being used.
- Accepted new tags become part of the user’s tag vocabulary going forward.

### Seed taxonomy (v1)

The seed taxonomy is the default starting vocabulary for a new/empty database:

| Tag              |
| ---------------- |
| Income           |
| Transfer         |
| Groceries        |
| Eat Out          |
| Coffee           |
| Transport        |
| Fuel             |
| Charging         |
| Novated Lease    |
| Parking          |
| Tolls            |
| Public Transport |
| Shopping         |
| Home             |
| Online           |
| Utilities        |
| Internet         |
| Mobile           |
| Subscriptions    |
| Entertainment    |
| Pub              |
| Bar              |
| Club             |
| Restaurant       |
| Health           |
| Pharmacy         |
| Insurance        |
| Rent             |
| Mortgage         |
| Travel           |
| Education        |
| Gifts            |
| Donations        |
| Fees             |
| Interest         |
| Taxes            |
| Deductible       |
| Unknown          |

## Proposal scopes (group and transaction)

Tag suggestions and tag rule proposals can be produced at two scopes:

- **Group scope**: a proposal targets a group (e.g. all transactions in the same entity group in Tag Review) and includes an impact preview for that group.
- **Transaction scope**: a proposal targets a single transaction and includes an impact preview for just that transaction.

The UI must support accepting/rejecting suggestions at either scope:

- group-level accept/reject applies to all transactions in the group (with merge semantics and transaction-level overrides)
- transaction-level accept/reject applies only to that transaction

## Business Rules

- Tag rules must never overwrite user-entered tags in the current import.
- Tag rules can contribute **suggestions** with source attribution.
- Impact preview must be computed deterministically.
- Tag rules must not be used to infer entity/type; they operate only on tag suggestions.

## User Stories

| #   | Story                                                                       | Summary                                                       | Status | Parallelisable   |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-tag-rule-contract](us-01-tag-rule-contract.md)                       | Define tag rule model + ChangeSet operations + impact preview | Done   | No (first)       |
| 02  | [us-02-generate-tag-proposal](us-02-generate-tag-proposal.md)               | Generate bundled tag-rule proposal from tag edits             | Partial | Blocked by us-01 |
| 03  | [us-03-approve-reject-tag-proposals](us-03-approve-reject-tag-proposals.md) | Approve/apply or reject-with-feedback tag rule ChangeSets     | Partial | Blocked by us-01 |

## Verification

- Tag edits in the current import can produce a proposal that increases the quality of future tag suggestions. *(API ready; import wizard integration pending — knoxio/pops#1741.)*
- Approving a tag rule proposal immediately improves suggested tags for remaining transactions in the current import without altering entity/type classification. *(Same — #1741.)*
