# US-09: Commit payload builder

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a system, I want a pure function that builds a structured commit payload from pending entities, pending ChangeSets, and confirmed transactions so that the commit endpoint (PRD-031) receives a single, validated, self-consistent request with all temp IDs resolved.

The builder resolves temp entity IDs by mapping each `temp:entity:{uuid}` to a placeholder that the commit endpoint will replace with real DB IDs after entity creation. It validates referential integrity: every temp entity ID referenced by a pending ChangeSet must exist in the pending entity list.

## Acceptance Criteria

- [ ] A pure function `buildCommitPayload(pendingEntities: PendingEntity[], pendingChangeSets: PendingChangeSet[], confirmedTransactions: ConfirmedTransaction[]) => CommitPayload` exists and is exported.
- [ ] The `CommitPayload` type includes: `entities: PendingEntity[]`, `changeSets: ChangeSet[]` (in order), and `transactions: ConfirmedTransaction[]`.
- [ ] The function validates that every temp entity ID (`temp:entity:*`) referenced in any ChangeSet operation's `entityId` field exists in the `pendingEntities` list. If not, it throws a descriptive error.
- [ ] The function validates that no ChangeSet operation references a temp entity ID that was removed from the pending list (dangling reference check).
- [ ] Confirmed transactions that reference a temp entity ID in their `entityId` field are included with the temp ID intact — the commit endpoint resolves them.
- [ ] The ordering of ChangeSets in the payload matches the insertion order from the pending store (the commit endpoint must apply them in this order).
- [ ] The function returns a frozen/immutable payload (or a plain object — the key requirement is that it is a snapshot, not a live reference to store state).
- [ ] Unit tests cover: empty payload (no pending anything), entities only, changeSets only, mixed payload with temp entity references, dangling reference error, ordering preservation, confirmed transactions with temp entity IDs.

## Notes

- The `CommitPayload` type should be defined in a shared location (e.g. `@pops/types` or co-located with the commit endpoint types) since both the frontend builder and the backend endpoint need to agree on the shape.
- The commit endpoint (PRD-031) will: (1) create entities, collecting temp-to-real ID mappings, (2) rewrite temp entity IDs in ChangeSets using the mapping, (3) apply ChangeSets in order, (4) insert confirmed transactions. This US only builds the payload — execution is out of scope.
- The `ConfirmedTransaction` type comes from `@pops/api/modules/finance/imports`. Inspect it at implementation time to determine whether it carries an `entityId` field that could reference a temp ID.
- Consider making the validation errors structured (e.g. `{ type: 'dangling-entity-ref', tempId, changeSetTempId }`) so the UI can surface them meaningfully if they ever occur.
