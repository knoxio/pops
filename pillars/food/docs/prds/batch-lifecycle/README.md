# Batch Lifecycle

Status: Done — every batch state-change has one canonical service and a REST endpoint. Schema, services, contract, handlers, and integration tests all shipped.

## Purpose

The non-cook batch operations: manual batch entry (groceries logged by hand), relocation between locations, expiry / notes / prep-state edits, quantity adjustment (waste, spoilage, correction), and soft-deletion. Cook-yielded batch creation is centralised here too via a thin wrapper over the recipe-run completion service, so the cook flow has a single batch-creation entry point.

After this PRD every batch mutation has one canonical service: cook events use `createBatchFromRun`, manual entry uses `createBatchManual`, fridge-view row actions use `relocateBatch` / `editBatch` / `adjustBatchQty` / `deleteBatch`. The fridge view (sibling PRD) consumes these through the REST contract.

The food pillar owns its own SQLite DB and serves these operations through its ts-rest contract (`pillars/food/src/contract/rest-batches.ts`, registered on the `batches` sub-router of `rest.ts`). The lifecycle services live in `db/services/batches-lifecycle.ts` (+ `batches-lifecycle-helpers.ts`); the `batches.deleted_at` column is defined in `db/schema/food-batches.ts`.

## Data model

Reads / writes the batch-model schema verbatim (`prds/batch-model`). The only delta this PRD owns:

- `batches.deleted_at TEXT` (nullable). Set non-null only by `deleteBatch`. Service-enforced invariant: `deleted_at IS NOT NULL → qty_remaining = 0`. No `CHECK` (SQLite `ALTER TABLE ADD CHECK` needs a table rebuild) — the invariant is held because `deleteBatch` flips both columns in one UPDATE, and every other writer rejects deleted rows (`BatchDeleted`).

Two distinct empty states: `qty_remaining=0` AND `deleted_at IS NULL` is "empty but recoverable via a positive correction"; `qty_remaining=0` AND `deleted_at IS NOT NULL` is "gone, hidden by default". Soft-deleted rows persist so cook-history JOINs through `batch_consumptions` still resolve. FIFO consumption naturally skips deleted rows because `qty_remaining > 0` is its filter (and the partial `idx_batches_remaining` predicate).

## REST API surface (`batches` sub-router)

- `POST /batches` — create a manual batch (`source_type ∈ {purchase, gift, other}`, `source_id` always null in v1). 201 `{ batchId }` or 400. Auto-derives `expires_at` from the variant's location shelf-life default unless overridden; `produced_at` defaults to now.
- `GET /batches/:id` — full `BatchDetail` with resolved variant / ingredient / prep-state names and, for `recipe_run` sources, `sourceRecipeRunId` + `sourceRecipeSlug`. 404 if absent.
- `POST /batches/:id/relocate` — body `{ location }`. Returns the discriminated `{ ok } | { ok:false, reason }` on 200.
- `PATCH /batches/:id` — body `{ expiresAt?, notes?, prepStateId? }` (nullable). Returns the mutation result on 200.
- `POST /batches/:id/adjust` — body `{ delta, reason }`. Returns `{ ok:true, newQty } | { ok:false, reason }` on 200.
- `DELETE /batches/:id` — soft-delete. Returns the mutation result on 200.
- `POST /batches/search-for-consume` — FIFO-ordered batches for the consume/override picker (filterable by ingredient / variant / location / `qtyGreaterThan` / `limit`). POST, not GET, so the literal path can't be shadowed by `GET /batches/:id`.

Lifecycle mutations return the service's discriminated result verbatim on 200 (the FE narrows on `ok`); `create` maps a failed result to 400 and `get` maps a missing batch to 404.

`BatchError ∈ { BatchNotFound, BatchDeleted, NegativeQty, CannotEditFromRun, BadExpiry, BadAdjustment }`.

## Services

`db/services/batches-lifecycle.ts` (all take the transactional `db`/`tx` first):

- `createBatchFromRun(db, runId, yieldArgs|null)` — wraps the recipe-run `markRunComplete`; single batch-creation entry point for the cook flow. Yieldless cooks pass `null` and get `{ batchId: null }`.
- `createBatchManual(db, input)` — inserts a `purchase`/`gift`/`other` batch; resolves default expiry; rejects `BadExpiry`.
- `relocateBatch(db, id, newLocation)` — UPDATEs `location`; recomputes `expires_at` only when the stored value matches the previous-location auto-default (else preserves the user override); appends `"Moved to <loc> on <date>"` to notes.
- `editBatch(db, id, patch)` — UPDATEs any of `expires_at` / `notes` / `prep_state_id`. `variant_id` and `qty_remaining` are deliberately not editable (change variant → new batch; change qty → `adjustBatchQty`).
- `adjustBatchQty(db, id, delta, reason)` — UPDATEs `qty_remaining` by `delta`; appends an audit line to notes.
- `deleteBatch(db, id)` — soft-delete: one UPDATE setting `qty_remaining=0` AND `deleted_at=now`.
- `countDeletedInvariantViolations(db)` — test-only post-suite invariant scan.

Default-expiry resolution (`deriveAutoDefaultExpiry`, shared by create + relocate): `fridge`/`freezer` → `produced_at + ingredient_variants.default_shelf_life_days_<location>`; `pantry`/`other` and missing-variant → null. Day arithmetic is UTC (`addDays`), matching the batch-model service's instant contract — not local-zone date math; the UI does any presentation-time conversion.

## Business rules

- `deleted_at` is written only by `deleteBatch`; that service is its sole writer. Hard delete is never exposed — the only paths out of active inventory are soft-delete or `adjustBatchQty` to zero — so cook-history JOINs always resolve.
- `createBatchFromRun` is the only producer of `source_type='recipe_run'` batches (the manual input enum excludes it). `source_id` is the run id for `recipe_run`; null for every manual source in v1 (`purchases` cross-domain integration deferred).
- Relocation between any two locations is allowed; no transitions are forbidden.
- Expiry can never precede `produced_at` — `createBatchManual` and `editBatch` reject with `BadExpiry`.
- `spoiled` / `wasted` adjustments require `delta < 0`; `correction` accepts any sign. Mismatch → `BadAdjustment`. A negative result → `NegativeQty` (also guarded by the DB `CHECK qty_remaining >= 0`). `delta === 0` is a no-op returning the unchanged qty.
- `editBatch` of `prep_state_id` on a `source_type='recipe_run'` batch → `CannotEditFromRun` (the prep state is pinned to the recipe's yield); other fields stay editable.
- Service-driven notes appends (relocate, adjust) prefix action + date and front-truncate to a 500-char cap with a leading `…`. User notes via `editBatch` overwrite the whole field; there is no separate structured audit table in v1 (notes is free-form).
- Every writer rejects a soft-deleted batch with `BatchDeleted`.

## Edge cases

- Manual batch with future `producedAt`: allowed (pre-recording a delivery); expiry defaults from `producedAt`.
- Adjust beyond stock (`-1000` on a `200g` batch): `NegativeQty`; UI clamps the input.
- Delete a non-empty batch: succeeds (sets qty 0 + deleted_at); UI confirms first. Deleting a batch with extant `batch_consumptions` rows is fine — soft-delete keeps the FK target.
- Relocate with a user-overridden expiry: preserved (mismatch with the recomputed old-location default). With an auto-default expiry: recomputed for the new location. If a user-set value happens to equal the old auto-default, relocate cannot tell and recomputes — accepted false-positive in v1 (no `expires_at_is_auto` column).
- Variant with both shelf-life columns null: auto-default returns null (shelf-stable); user may set expiry manually.
- Manual `unit` ≠ variant `default_unit`: allowed at the schema layer (e.g. record "12 oranges" as `count`); UI defaults to `default_unit` but lets the user override.
- Concurrent edits on one batch: last write wins (single-user, rare).

## Acceptance criteria

Schema

- [x] `batches.deleted_at TEXT NULL` exists in `db/schema/food-batches.ts`; the batch-model FIFO query plan is unaffected.

Services (`db/services/batches-lifecycle.ts`)

- [x] Exports `createBatchFromRun`, `createBatchManual`, `relocateBatch`, `editBatch`, `adjustBatchQty`, `deleteBatch`.
- [x] `createBatchFromRun` calls `markRunComplete` exactly once with the transactional db; yieldless cooks return `{ batchId: null }`.
- [x] `createBatchManual` resolves default expiry via the shelf-life formula (null for pantry/shelf-stable) and allows an override.
- [x] `relocateBatch` recomputes expiry only when the previous value matches the previous-location auto-default; otherwise preserves; rejects deleted batches.
- [x] `editBatch` rejects `CannotEditFromRun` for `prepStateId` edits on `recipe_run`-sourced batches, and `BadExpiry` when the patch expiry precedes `producedAt`.
- [x] `adjustBatchQty` rejects `NegativeQty` below zero and `BadAdjustment` on spoiled/wasted with `delta >= 0`; otherwise updates and appends to notes; zero delta is a no-op.
- [x] `deleteBatch` sets `qty_remaining=0` AND `deleted_at=now` in one transaction.

Contract (`rest-batches.ts` + `batches-handlers.ts`)

- [x] All seven endpoints above are served from the `batches` sub-router with the right verbs/paths; mutations are transactional.
- [x] `GET /batches/:id` returns the full `BatchDetail` including resolved variant / ingredient / prep-state / recipe-slug names.
- [x] All error codes are returned on their respective conditions; `create` maps failure to 400, `get` maps missing to 404.

Invariant & backward compat

- [x] FIFO consumption never picks a `deleted_at IS NOT NULL` batch (integration test).
- [x] **Invariant**: every `deleted_at IS NOT NULL` row has `qty_remaining = 0` — `countDeletedInvariantViolations` returns 0 after the full suite.

Tests (`db/__tests__/batches-lifecycle.test.ts`)

- [x] Covers manual-create defaults / override / shelf-stable null; relocate preserve-vs-recompute + deleted rejection; edit prep-state rejection + null-clear + verbatim-notes overwrite; adjust spoil/waste/correction + NegativeQty + zero no-op + deleted rejection; delete atomicity + post-delete FIFO skip + double-delete rejection; 500-char notes truncation; UTC midnight `addDays` boundary; `createBatchFromRun` yielded-batch write + yieldless path.

## Deferred

Lifecycle-specific forward-looking work lives in `../../ideas/batch-lifecycle-extensions.md`: a structured `batch_events` audit table (replacing notes-field append), batch templates for frequently-bought items, bulk batch operations, cross-batch transfers (portioning), and external-system / receipt-scanning ingestion.

Data-model extensions (the `purchases` provenance table for `source_type='purchase'`, expiry alerts/notifications, unit conversion at consume time, multi-output recipes, substitution-aware consumption) live in `../../ideas/batch-model-extensions.md`.
