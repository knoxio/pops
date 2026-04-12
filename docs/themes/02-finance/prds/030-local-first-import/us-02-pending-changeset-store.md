# US-02: Pending changeset store

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a user, I want approved ChangeSets during import to be buffered locally in an ordered zustand slice so that rule changes are deferred until the explicit commit step while remaining available for merged-rule computation and preview.

The slice manages an ordered list of `PendingChangeSet` objects. Insertion order matters because `applyChangeSetToRules` is applied sequentially and later ChangeSets see the cumulative effect of earlier ones.

## Acceptance Criteria

- [ ] A `pendingChangeSets` slice exists in the import store (or a companion store) with state `PendingChangeSet[]` and actions `addPendingChangeSet`, `listPendingChangeSets`, `removePendingChangeSet`.
- [ ] `addPendingChangeSet` appends a new entry to the end of the ordered list with a temp ID in the format `temp:changeset:{uuid}`, the provided `ChangeSet`, an ISO `appliedAt` timestamp, and a `source` string.
- [ ] `listPendingChangeSets()` returns all pending ChangeSets in insertion order.
- [ ] `removePendingChangeSet(tempId)` removes the entry with the given temp ID. No-op if not found.
- [ ] Removing a ChangeSet from the middle of the list preserves the relative order of remaining entries.
- [ ] The `reset` action clears all pending ChangeSets.
- [ ] Unit tests cover: add single, add multiple (order preserved), remove from middle, remove nonexistent, list ordering, reset.

## Notes

- The `PendingChangeSet` type is `{ tempId: string; changeSet: ChangeSet; appliedAt: string; source: string }`.
- The `ChangeSet` type is imported from the existing corrections module (`@pops/api/modules/core/corrections`).
- Removal triggers downstream consumers (merged rule computation in US-03, re-evaluation in US-07) to recompute. The slice itself does not orchestrate recomputation — it just updates state and lets subscribers react.
- This slice is consumed by US-03, US-06, US-08, and US-09.
