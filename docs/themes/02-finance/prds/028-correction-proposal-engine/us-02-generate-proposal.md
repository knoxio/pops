# US-02: Generate bundled proposal from correction signal

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want the system to propose the right generalisation when I correct a transaction, so that the rules it suggests match the same merchant/counterparty without being overly specific or overly broad. The generator must also support iterative refinement: given a current ChangeSet and a natural-language instruction from the user, it should return a revised ChangeSet rather than a one-shot suggestion.

## Acceptance Criteria

- [ ] When the user triggers Save & Learn, the system generates a **bundled ChangeSet proposal** (always modelled as a ChangeSet of N ≥ 1 operations, even for the simplest case).
- [ ] Proposal generation has two entry points:
  - **Initial**: inputs are the corrected transaction(s), the user's intended correction, and a bounded set of relevant existing rules.
  - **Revise**: inputs are the triggering transaction(s), the **current in-progress ChangeSet**, and a free-text instruction (from the US-06 AI helper). Output is a revised ChangeSet.
- [ ] Optional rejection feedback may be passed as an additional input on either path to steer generation away from a previously rejected direction.
- [ ] The proposal can include multiple operations in one bundle, including combinations of:
  - adding a new rule
  - editing an existing rule (narrow/broaden)
  - disabling/removing an existing rule that causes incorrect matches
- [ ] A revise call may add, edit, split, merge, or remove any operation in the supplied ChangeSet — including operations the user manually added before asking for help.
- [ ] Each operation includes a brief rationale and the proposed confidence/activation semantics.
- [ ] The response includes an impact preview for the current import session, computed by the same deterministic matcher used in processing.
- [ ] Generation is bounded: the set of existing rules and transactions sent to the generator must be scoped per the PRD scope-control rule, on both initial and revise paths.

