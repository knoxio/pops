# PRD-145: Batch Lifecycle

> Epic: [05 — Meal Planning & Batches](../../epics/05-meal-planning.md)

## Overview

Own the non-cook batch operations: manual batch entry (when the user buys groceries and wants to log them), batch relocation between locations, expiry edit, manual qty adjustment (waste, spoilage), and soft-deletion. Also expose a thin service wrapper around PRD-108's `markRunComplete` that PRD-144's cook mutation calls — keeping batch-creation logic centralised. PRD-147 consumes these services from the fridge view's row actions.

After this PRD, every batch state-change has one canonical service: cook events use `createBatchFromRun`, manual entry uses `createBatchManual`, the fridge row actions use `relocateBatch` / `editBatch` / `adjustBatchQty` / `deleteBatch`.

Schema impact is small: one additive `batches.deleted_at` column for soft-delete (per Epic 05 risks). Otherwise reads/writes the PRD-108 schema verbatim.

## Schema delta

```sql
ALTER TABLE batches ADD COLUMN deleted_at TEXT;
-- Service-enforced invariant: deleted_at IS NOT NULL → qty_remaining = 0.
-- A CHECK constraint is not added because ALTER TABLE ADD CHECK requires a
-- table rebuild in SQLite; instead the invariant is held by:
--   (a) deleteBatch() always sets both columns in one statement
--   (b) editBatch / adjustBatchQty / createBatchManual / createBatchFromRun
--       reject writes when deleted_at IS NOT NULL (BatchDeleted)
-- See acceptance criteria for a Vitest case pinning this invariant.
```

Nullable. Set non-null only via `deleteBatch` (soft-delete). Cook-history JOINs through `batch_consumptions` still resolve because the row persists. PRD-147 filters `deleted_at IS NULL` from default views; a "Show deleted" toggle reveals them.

PRD-108 documented "qty_remaining=0 batches persist for cook history"; soft-delete is the same idea for the "I never want to see this again" case. The two states are distinct: empty (qty_remaining=0, deleted_at null) vs explicitly hidden (deleted_at set, qty_remaining always 0).

### Backwards compatibility

The schema change is additive. PRD-108's `consumeForRun` FIFO query naturally skips `deleted_at IS NOT NULL` rows because of the service-enforced invariant above — every deleted batch has `qty_remaining = 0`, which is the partial-index predicate PRD-108's `idx_batches_remaining` already filters by. The index DDL is unchanged.

**PRD-108 amendments noted by this PRD:**

1. `markRunComplete(runId, opts)` accepts `opts: { yield?: YieldArgs }` and is called from `createBatchFromRun(runId, yieldArgs, db)`. When `yield` is present and the recipe yields, it INSERTs a batch row + UPDATEs `recipe_runs.completed_at` + `recipe_runs.yielded_batch_id`. When `yield` is absent (yieldless recipe), it just sets `completed_at`. PRD-108's acceptance criterion line 190 lists `markRunComplete` but doesn't document the `opts` shape — this PRD fills that in.
2. `markRunComplete` is now expected to be called via PRD-145's `createBatchFromRun` wrapper, not directly by PRD-144. The direct PRD-108 service still exists for unit-test use.

## Services

```ts
// packages/app-food/src/services/batches.ts
export async function createBatchFromRun(
  runId: number,
  yieldArgs: YieldArgs,
  db: SqliteDb
): Promise<{ batchId: number }>;

export async function createBatchManual(
  input: ManualBatchInput,
  db: SqliteDb
): Promise<{ batchId: number }>;

export async function relocateBatch(
  batchId: number,
  newLocation: 'pantry' | 'fridge' | 'freezer' | 'other',
  db: SqliteDb
): Promise<{ ok: true } | { ok: false; reason: BatchError }>;

export async function editBatch(
  batchId: number,
  patch: BatchEditPatch,
  db: SqliteDb
): Promise<{ ok: true } | { ok: false; reason: BatchError }>;

export async function adjustBatchQty(
  batchId: number,
  delta: number, // negative = waste / spoilage; positive = correction
  reason: 'spoiled' | 'wasted' | 'correction',
  db: SqliteDb
): Promise<{ ok: true; newQty: number } | { ok: false; reason: BatchError }>;

export async function deleteBatch(
  batchId: number,
  db: SqliteDb
): Promise<{ ok: true } | { ok: false; reason: BatchError }>;

export type YieldArgs = {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  expiresAt?: string; // null = compute from variant default shelf life
  notes?: string;
};

export type ManualBatchInput = {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  sourceType: 'purchase' | 'gift' | 'other'; // 'recipe_run' is for createBatchFromRun only
  producedAt?: string; // ISO date; default = now
  expiresAt?: string; // null = shelf-stable
  notes?: string;
};

export type BatchEditPatch = {
  expiresAt?: string | null;
  notes?: string | null;
  prepStateId?: number | null;
};

export type BatchError =
  | 'BatchNotFound'
  | 'BatchDeleted'
  | 'NegativeQty' // adjust would push qty below 0
  | 'CannotEditFromRun' // certain patches forbidden on cook-yielded batches (see below)
  | 'BadExpiry' // expiresAt earlier than producedAt
  | 'BadAdjustment'; // delta sign vs reason mismatch (spoiled/wasted require delta < 0)
```

### `createBatchFromRun` (PRD-144 caller)

Wraps PRD-108's `markRunComplete`. The `yieldArgs.expiresAt` falls back to `produced_at + ingredient_variants.default_shelf_life_days_<location>` (where `<location>` is `fridge` or `freezer`; `pantry` / `other` get NULL by default). Returns the batch row's id; PRD-144 stores it in the response.

The function's purpose is single-API-surface: PRD-144 doesn't import from PRD-108 directly; it imports from `packages/app-food/src/services/batches.ts`. Future changes to batch-creation logic (e.g. a "Recently cooked" notification, an expiry-alert trigger) layer here without touching PRD-144.

### `createBatchManual` (manual-entry caller — PRD-147)

Creates a batch row with `source_type IN ('purchase', 'gift', 'other')` and `source_id = NULL` (PRD-108 explicitly leaves `purchases` cross-domain integration deferred; `source_id` stays null for v1). `produced_at` defaults to `datetime('now')`; `expires_at` follows the same default-shelf-life logic as cook events.

PRD-147 surfaces this as a "+ Add batch" button in the fridge view.

### `relocateBatch`

UPDATEs `batches.location`. Side effects:

- Re-computes `expires_at` IFF the original `expires_at` was the auto-default (i.e. matches `produced_at + previous-location's default-shelf-life`). The service detects this by recomputing and comparing — if the stored value matches the computed default, treat it as auto and recompute for the new location; otherwise leave the user's override alone.
- Logs a relocation event into `batches.notes` (appended): `"Moved to fridge on 2026-06-08"`. 500-char cap; oldest entries truncate with `…`.

Rejected with `BatchDeleted` if `deleted_at IS NOT NULL`.

### `editBatch`

UPDATEs `expires_at`, `notes`, and/or `prep_state_id`. The patch type (`BatchEditPatch`) omits `variant_id` by design — to change a batch's variant, soft-delete the existing batch and create a new one. `qty_remaining` is similarly omitted (use `adjustBatchQty` so the audit-trail rules apply).

`CannotEditFromRun`: if `batches.source_type='recipe_run'`, the `prep_state_id` is forbidden from edit (it's pinned to the recipe's yield). Other fields are editable.

### `adjustBatchQty`

UPDATEs `qty_remaining` by `delta`. `reason` is appended to `notes` for audit:

- `'spoiled'`: "Spoiled 200g on 2026-06-08"
- `'wasted'`: "Wasted 100g on 2026-06-08 (e.g. burnt, dropped)"
- `'correction'`: "Adjusted by +50g on 2026-06-08 (correction)"

Rejected with `NegativeQty` if `qty_remaining + delta < 0`. PRD-108's CHECK already enforces this at the DB layer, but the service surfaces a structured error.

Positive deltas are allowed — corrections from "I miscounted, there are 2 more in the back of the pantry". Surface in the UI but don't make it the primary affordance.

### `deleteBatch`

Soft-delete: UPDATE `batches SET deleted_at = datetime('now'), qty_remaining = 0`. The qty_remaining flip ensures FIFO never sees it; the deleted_at flip lets PRD-147 hide it by default.

Confirms in the UI when `qty_remaining > 0` at delete time (loses inventory). PRD-147 owns the confirm dialog.

Hard delete is NEVER offered — preserves cook history JOINs.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.batches.create: mutation({
  input: ManualBatchInput,
  output: { batchId: number },
});

food.batches.relocate: mutation({
  input: { id: number, location: 'pantry' | 'fridge' | 'freezer' | 'other' },
  output: { ok: true } | { ok: false, reason: BatchError },
});

food.batches.edit: mutation({
  input: { id: number, expiresAt?: string | null, notes?: string | null, prepStateId?: number | null },
  output: { ok: true } | { ok: false, reason: BatchError },
});

food.batches.adjustQty: mutation({
  input: { id: number, delta: number, reason: 'spoiled' | 'wasted' | 'correction' },
  output: { ok: true, newQty: number } | { ok: false, reason: BatchError },
});

food.batches.delete: mutation({
  input: { id: number },
  output: { ok: true } | { ok: false, reason: BatchError },
});

food.batches.get: query({
  input: { id: number },
  output: BatchDetail | null,
});

export type BatchDetail = {
  id: number;
  variantId: number;
  variantName: string;
  variantSlug: string;
  ingredientId: number;
  ingredientName: string;
  ingredientSlug: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  sourceType: 'purchase' | 'recipe_run' | 'gift' | 'other';
  sourceId: number | null;
  sourceRecipeRunId: number | null;             // mirror of sourceId when sourceType='recipe_run'
  sourceRecipeSlug: string | null;              // resolved when sourceType='recipe_run'
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  producedAt: string;
  expiresAt: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
};
```

## Default-shelf-life resolution

When `expiresAt` is omitted on `createBatchFromRun` / `createBatchManual`, the service computes:

```ts
function resolveExpiresAt(
  producedAt: string,
  location: Location,
  variant: IngredientVariant
): string | null {
  const days =
    location === 'fridge'
      ? variant.default_shelf_life_days_fridge
      : location === 'freezer'
        ? variant.default_shelf_life_days_freezer
        : null; // pantry and 'other' have no default
  if (days == null) return null;
  return addDays(producedAt, days);
}
```

`addDays` uses `date-fns` to handle timezone-safe date math. Tests pin midnight boundaries.

When the user changes location via `relocateBatch`, the same function recomputes — IF the original `expires_at` was an auto-default (detected by re-running the resolution for the OLD location and seeing if it matches).

## Business Rules

- `batches.deleted_at` is set only by `deleteBatch`. Service is the only writer.
- Hard delete is never exposed; the only path to remove a batch from active inventory is soft-delete or `adjustBatchQty` to zero.
- `qty_remaining=0` AND `deleted_at IS NULL` is "empty but available for un-empty via adjustQty correction". `qty_remaining=0` AND `deleted_at IS NOT NULL` is "gone".
- `createBatchFromRun` is the ONLY way to create a batch with `source_type='recipe_run'`. Direct manual creation can't claim that source_type (`createBatchManual`'s input enum excludes it).
- `source_id` for `source_type='recipe_run'` is set by `createBatchFromRun` to the run's id; for other source_types it's always NULL in v1 (purchases cross-domain integration deferred).
- Relocation between any two locations is allowed; no transitions are forbidden.
- Expiry edit cannot push `expires_at` before `produced_at` — server rejects with `BadExpiry` (small new error; add to enum when implementing).
- Adjust qty negative reasons (`spoiled`, `wasted`) require `delta < 0`; positive `delta` requires `reason='correction'`. Mismatch returns `BadAdjustment` (also add to enum at implementation time).
- Notes append from service-driven events (relocate, adjust) prefix with the action and date. User-supplied notes via `editBatch` overwrite the entire field; the append history is preserved only as far back as the 500-char cap allows. (This is intentional: notes is a free-form field; structured audit trail would require a separate `batch_events` table — deferred.)

## Edge Cases

| Case                                                                                                   | Behaviour                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual batch with `producedAt` in the future                                                           | Allowed (pre-recording an incoming delivery). Expires defaults to `producedAt + shelf-life-days`.                                                                                                                                                 |
| Manual batch with `expiresAt` before `producedAt`                                                      | Rejected (`BadExpiry`). UI also blocks.                                                                                                                                                                                                           |
| Adjust qty by -1000 on a 200g batch                                                                    | `NegativeQty` (would land at -800). UI clamps the negative input to the current qty.                                                                                                                                                              |
| Adjust qty by +0                                                                                       | No-op; service returns `ok: true, newQty: <unchanged>`.                                                                                                                                                                                           |
| Delete a non-empty batch                                                                               | Service succeeds (sets qty_remaining=0 + deleted_at); UI confirms before submitting.                                                                                                                                                              |
| Delete a batch with extant `batch_consumptions` rows                                                   | Allowed; soft-delete preserves the consumption rows' FK target.                                                                                                                                                                                   |
| Relocate from fridge to freezer for a batch with user-overridden expiresAt                             | `expiresAt` is preserved (user override detection sees mismatch with the auto-default).                                                                                                                                                           |
| Relocate from fridge to freezer for a batch with auto-default expiresAt                                | `expiresAt` is recomputed for freezer's default shelf life.                                                                                                                                                                                       |
| Variant has both `default_shelf_life_days_fridge=NULL` and `..._freezer=NULL`                          | Auto-default returns NULL (shelf-stable). User can manually set expiresAt.                                                                                                                                                                        |
| `editBatch` with `prepStateId` on a `source_type='recipe_run'` batch                                   | `CannotEditFromRun`. The prep state is pinned to the recipe's yield.                                                                                                                                                                              |
| Concurrent edits on the same batch                                                                     | Last write wins. Single-user; rare.                                                                                                                                                                                                               |
| Adjust qty on a soft-deleted batch                                                                     | Rejected with `BatchDeleted`. UI hides Adjust for deleted batches.                                                                                                                                                                                |
| `createBatchManual` with `variantId` of a deleted ingredient_variant                                   | FK rejection (ingredient_variants is rarely deleted; PRD-106 documents the constraint). UI fetches non-deleted only.                                                                                                                              |
| `createBatchManual` with `unit` not matching variant's `default_unit`                                  | Allowed at the schema layer; PRD-147's UI defaults to `default_unit` but lets the user override (e.g. record "12 oranges" as count).                                                                                                              |
| Notes append pushes over 500 chars                                                                     | Front-truncate with `…` prefix.                                                                                                                                                                                                                   |
| User-set `expires_at` happens to equal the auto-default for the previous location                      | `relocateBatch` cannot distinguish — recomputes expiry as if it were auto-default. False-positive accepted in v1; an `expires_at_is_auto` column is out of scope. UI may warn ("Expiry was auto-recomputed; was it user-set? Adjust if needed."). |
| User edits notes via `editBatch`, then later `relocateBatch` or `adjustBatchQty` appends an audit line | Append always lands on the current notes string. If the user's edit wiped the prior audit trail, subsequent appends start fresh — by design. Notes is a free-form field; a structured `batch_events` audit table is out of scope.                 |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [ ] Migration adds `batches.deleted_at TEXT NULL`.
- [ ] PRD-108's existing tests still pass (no breakage to FIFO query plan).

### Services

- [ ] `packages/app-food/src/services/batches.ts` exports the six functions above.
- [ ] `createBatchFromRun` calls PRD-108's `markRunComplete` exactly once; takes the transactional `db` argument.
- [ ] `createBatchManual` resolves default expiry via the shelf-life formula; allows override.
- [ ] `relocateBatch` recomputes expiry only when the previous value matches the previous-location auto-default; otherwise preserves.
- [ ] `editBatch` rejects `CannotEditFromRun` for `prep_state_id` edits on recipe_run-sourced batches.
- [ ] `adjustBatchQty` rejects `NegativeQty` when the delta would push below 0; otherwise updates and appends to notes.
- [ ] `deleteBatch` sets `qty_remaining=0` AND `deleted_at=datetime('now')` in one transaction.

### tRPC

- [ ] All procedures in the API section exist in `apps/pops-api/src/modules/food/router.ts`.
- [ ] All mutations are transactional.
- [ ] `food.batches.get` returns the full `BatchDetail` including resolved variant / ingredient / prep-state / recipe slug names.
- [ ] All error codes returned on their respective conditions.

### Backward compat & invariant

- [ ] PRD-108's FIFO consumption (`consumeForRun`) NEVER picks a `deleted_at IS NOT NULL` batch (verified by an integration test).
- [ ] PRD-108's existing `recipe_runs.yielded_batch_id` is set by `createBatchFromRun` exactly the way `markRunComplete` did before (no behavioural change; just centralisation).
- [ ] **Invariant**: every row with `deleted_at IS NOT NULL` also has `qty_remaining = 0`. Verified by a Vitest assertion that scans the table after the full service test suite runs (`SELECT COUNT(*) WHERE deleted_at IS NOT NULL AND qty_remaining > 0` must be 0).
- [ ] `BadExpiry` returned when `editBatch` patch's `expiresAt < producedAt`.
- [ ] `BadAdjustment` returned when `adjustBatchQty` is called with `reason='spoiled'|'wasted'` and `delta >= 0`.

### Tests

- [ ] Vitest integration at `packages/app-food/src/services/__tests__/batches-lifecycle.test.ts`:
  - `createBatchManual` with all defaults; manual override; null expires for shelf-stable variants.
  - `relocateBatch` preserves user-overridden expiry; recomputes auto-default expiry; rejects deleted batches.
  - `editBatch` rejects `prep_state_id` edits on recipe_run-sourced batches.
  - `adjustBatchQty` waste / spoilage / correction paths; rejects NegativeQty.
  - `deleteBatch` soft-deletes; FIFO skips after.
  - Notes-append truncation honours the 500-char cap.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/batches-router.test.ts` mirrors the service tests at the tRPC layer.
- [ ] Timezone-boundary test: `addDays` near midnight produces the expected ISO date in the user's local zone.

## Out of Scope

- A separate `batch_events` audit table — out of scope. Notes-field append is the v1 audit trail.
- `purchases` cross-domain table (for `source_type='purchase'` integration with finance) — deferred.
- Bulk batch operations (relocate-many, delete-many) — out of scope; per-row only.
- Batch import from external systems (e.g. inventory scanner) — out of scope.
- QR code generation / sticker printing — out of scope.
- Notifications on expiring batches — none in v1 (theme decision).
- Cross-batch transfers ("move 100g from batch A to batch B" — e.g. portioning) — out of scope; the user creates a new batch and adjusts the old.
- A "batch templates" feature (frequently-bought items pre-filled) — deferred; future PRD if useful.
- Receipt-scanning ingestion of purchases — out of scope (cross-domain with finance theme).

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredient_variants` schema; `default_shelf_life_days_fridge` / `default_shelf_life_days_freezer` columns (added by PRD-108's ALTER).
- **PRD-108** — `batches` / `recipe_runs` / `batch_consumptions` schema; `markRunComplete` service (wrapped here).
- **PRD-118** — `app-food` shell.
- **PRD-144** — primary caller of `createBatchFromRun`.
- **PRD-147** — primary caller of all the other services (relocate / edit / adjust / delete / create-manual / get).
