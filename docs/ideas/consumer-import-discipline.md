# Idea: generate the cross-pillar boundary rules from a canonical pillar list

The consumer-import-discipline boundary rules are currently **hand-maintained**
in `.dependency-cruiser.cjs`: one `no-dead-<pillar>-pkgs` tombstone block per
retired family, plus the structural `pillar-no-cross-internal` /
`no-deep-internal-import` rules. The shipped PRD covers what is enforced today.

This idea is the rejected/deferred alternative: **generate** the per-pillar rule
blocks from a single canonical pillar list instead of writing them by hand. None
of it exists in the tree.

## What was proposed but never built

- `scripts/contract/pillar-list.ts` — a canonical `PILLARS` array; adding a pillar
  is one string, and all boundary tooling reads from it.
- `scripts/contract/generate-boundary-rules.ts` → emits
  `.dependency-cruiser.rules.generated.cjs`, a committed file that
  `.dependency-cruiser.cjs` imports and spreads into `forbidden`.
- `scripts/contract/verify-boundary-rules.ts` + a `lint:boundaries:verify` script
  — a drift check that fails CI when the generated file is stale relative to the
  pillar list (same pattern api-extractor / manifest-generation use elsewhere).
- A CI step that runs `lint:boundaries:verify` **before** `lint:boundaries` in the
  Module boundaries job.

## Why it isn't in the shipped PRD

- It does not exist: there is no `scripts/contract/`, no `pillar-list.ts`, no
  generator, no `.dependency-cruiser.rules.generated.cjs`, no
  `lint:boundaries:verify`, and no drift step in `quality.yml`.
- The current tombstone rules are written against a **fixed, closed set** of
  retired package families. The migration is complete; new pillars are born
  inside `pillars/<id>/` with no `*-db` / `*-contract` / `*-api` packages to
  retire, so there is no per-pillar block to generate. The generator solved a
  drift problem that the closed tombstone set does not have.
- Naming throughout the original proposal was the dead `packages/<P>-db`,
  `apps/pops-<P>-api`, `packages/<P>-contract/scripts/**`, tRPC-router-for-OpenAPI
  shape — none of which exists in the federated REST architecture. A generator
  rebuilt to today's layout would be a different design, not this one.

## When this would become worth building

If the rule set ever needs **one block per live pillar** (e.g. a future rule that
must enumerate every pillar, not just a closed retirement set), revisit
generating it from a canonical list with a committed generated file + a drift
gate. Until then, the hand-maintained closed set is simpler and has no drift
surface to guard.

## Also dropped

- The contract-package OpenAPI-generator exception
  (`packages/<pillar>-contract/scripts/**` allowed to import the pillar runtime
  for type extraction). Obsolete: contracts live in-pillar
  (`pillars/<id>/src/contract`) and the OpenAPI snapshot is produced inside the
  pillar, so there is no cross-package exception to carve.
