# FIFO Consumption UI

Status: **Partially built.** The server-side override engine and the picker endpoint are live and tested end-to-end; the FE shortfall-resolution components and the `useCookResolution` hook are built and unit-tested in isolation. **Not yet wired:** the live cook modal does not surface real shortfalls — `prepareCook` emits no `LineShortfall[]`, and the modal hardcodes an empty shortfall set (`CookModal` → `useCookResolution({ shortfalls: [] })`, `CookModalContent` → `ShortfallList shortfalls={[]}` / `ConsumePreviewPanel hasShortfalls={false}`). So in production the shortfall panel never renders, the picker is never reachable from the modal, and the Mark-cooked gate is inert (`unresolvedShortfallCount` is always `0`). The end-to-end wiring is tracked in `../../ideas/fifo-consumption-ui-live-wiring.md`. Two deviations from intent on the parts that _are_ built, both implemented and tested: external/audit notes use a machine-readable token format (not prose), and the notes cap is plain back-truncation at 1000 chars (not front-truncation with an `…` prefix). The substitution-edge branch on overrides is also wired (see `cook-time-substitutions` PRD).

The consume-preview + shortfall-resolution UX is designed to layer inside the cook modal. It surfaces which batches the FIFO helper will consume at the user's current scale factor, lets the user override a per-line batch choice, and resolves shortfalls via a batch override or a "consumed externally" marker that records the gap without writing a `batch_consumptions` row. The Mark-cooked button is gated on this resolution state: every non-optional line has a deterministic disposition before the cook mutation fires, so a cook with mixed inventory state still completes atomically. The override-application and gating logic exist; what is missing is the server→modal shortfall feed that would make the resolution UX user-reachable.

Schema impact: zero. `batches`, `recipe_runs`, `batch_consumptions` are unchanged; "consumed externally" is a service-layer concept that omits a `batch_consumptions` row and appends an audit line to `recipe_runs.notes`.

## Surface

> The panel behavior below describes the intended (and component-level tested) design. In the current build the live modal feeds both panels an empty shortfall set, so the shortfall-driven branches do not fire in production — see Status.

Two panels embedded in the cook modal between the field grid and the action buttons:

1. **Consume preview** (`ConsumePreviewPanel`) — rendered when any line is covered. Auto-collapses in the happy path (no shortfalls); defaults expanded when any shortfall exists. Lists each resolved line with its disposition (FIFO / batch-override / partial / external) and batch reference(s). A "Show all" expander appears past a collapsed limit so long recipes stay tight.
2. **Shortfalls** (`ShortfallList`) — rendered only when shortfalls exist. Expanded by default; collapsible, but collapsing never enables Mark-cooked. Each row (`ShortfallRow`) offers three radios: pick a batch, mark consumed externally, or split (partial). `BatchOverridePicker` is the search/select widget for the batch choice.

The Mark-cooked button reads `unresolvedShortfallCount` from `useCookResolution` (shared React state inside the modal) and disables while it is `> 0`.

## Resolution model (FE-only modal state)

`useCookResolution` holds a `ReadonlyMap<lineIndex, LineResolution>` keyed by `recipe_lines.position` (1-based):

```ts
type LineResolution =
  | { kind: 'fifo' }
  | { kind: 'batch-override'; batchId: number; consumeQty: number; substitutionEdgeId?: number }
  | { kind: 'external'; reasonNote?: string }
  | {
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      substitutionEdgeId?: number;
    };
```

Seeding on open: every non-optional line the FIFO helper can fully cover starts `fifo`; optional lines are skipped entirely; lines with a real `LineShortfall` start unresolved. A resolution "covers" a shortfall when `external` (user asserts the gap is met outside the system), or when `batch-override.consumeQty >= needed`, or when `partial.consumeQty + externalQty >= needed`. `partial` is UI sugar over the same wire shape — it auto-suggests `externalQty = needed - available`.

The map is local to the modal session (closing discards it). A scale-factor change (or a change in the line set) reseeds the whole map and bumps `scaleResetSignal` so the UI can surface a reset prompt — prior `consumeQty` selections no longer apply at the new scale.

## REST API surface

The override shape rides on the existing cook mutation; this PRD adds one batches query for the picker.

`POST /batches/search-for-consume` — FIFO-ordered batches for the picker. Body: `{ ingredientId?, variantId?, location?, qtyGreaterThan?, limit? }` (limit max 100). Returns `{ items: BatchForConsumeRow[] }`, non-deleted, non-empty, sorted by `expires_at ASC NULLS LAST, produced_at ASC`. `variantId` takes precedence over `ingredientId`. Each row: `{ id, variantId, variantName, variantSlug, ingredientId, ingredientName, prepStateId, prepStateLabel, qtyRemaining, unit, location, expiresAt, producedAt }`. POST (not GET) so the literal path is not shadowed by `GET /batches/:id`.

`POST /cook/mark-cooked` carries `consumptionOverrides?: ConsumptionOverride[]`, a discriminated union on `kind`:

```ts
type ConsumptionOverride =
  | { lineIndex; kind: 'batch-override'; batchId; consumeQty; unit; substitutionEdgeId? }
  | { lineIndex; kind: 'external'; externalQty; externalUnit }
  | { lineIndex; kind: 'partial'; batchId; consumeQty; externalQty; unit; substitutionEdgeId? };
```

`lineIndex` matches `recipe_lines.position`. Qty fields are finite & nonnegative; range/coverage validation is server-side, not zod's job.

## Server flow inside `markCooked`

Single transaction. `applyConsumptionOverrides` runs first, then the FIFO helper covers what's left:

1. Build a `position -> LineDescriptor` map for the version (variant, prep state, optional flag, scaled need, canonical unit).
2. For each override: unknown `lineIndex` is silently skipped; an override on an `optional` line is silently dropped (optional lines never reach FIFO). Otherwise the override must account for the **full scaled need** — a `consumeQty` that under-covers the line returns `ShortfallUnresolved` rather than silently bypassing FIFO for the remainder. Unit must match the line's canonical unit (no conversion at the cook layer).
   - `batch-override` / `partial` draw from the named batch: reject if deleted, unit-mismatched, variant-mismatched, prep-state-mismatched (unless a `substitutionEdgeId` is present), or under-stocked → `ShortfallUnresolved`. On success, INSERT one `batch_consumptions` row and decrement `qty_remaining`. `partial` additionally emits an external audit line for its `externalQty`.
   - `external` emits an audit line only (no `batch_consumptions` row); `externalQty <= 0` → `ShortfallUnresolved`.
3. `computeRemainingNeeds` strips overridden + optional lines; `consumeForRun` runs FIFO over the rest. Any returned `Shortfall` means a non-overridden line couldn't be covered → `ShortfallUnresolved`.
4. Audit lines are appended to `recipe_runs.notes` (joined with user notes by `\n`, capped at 1000 chars). Any failure rolls back the whole transaction; result is `{ ok: false, reason, shortfalls? }`.

This keeps the FIFO helper's `ConsumptionNeed` shape unchanged — the line-index→batch bookkeeping lives entirely in the cook mutation.

## Business rules

- Mark-cooked enables only when `unresolvedShortfallCount === 0`; the count is independent of panel visibility (collapsing the shortfall panel does not enable submission).
- `batch-override` may point at a **different variant or prep state** than the line requested (the override carries its own expected variant/prep via substitution context; freeform overrides still require a variant/prep match unless a substitution edge is supplied). Cook history records what was actually drawn.
- The override batch must have `qtyRemaining >= consumeQty` at submit time; a concurrent cook that depletes it yields `ShortfallUnresolved` and the modal re-prompts.
- External markers are recorded as machine-readable audit tokens (`cook-override:external line=<N> qty=<Q> unit=<U>`) appended to `recipe_runs.notes`, capped at 1000 chars.
- Unit conversion is never applied at the cook/override layer; unit-incompatible batches are rejected server-side and filtered from the picker.

## Edge cases

- 0 ingredient lines → both panels hidden; Mark-cooked always enabled (gating short-circuits at `unresolvedShortfallCount === 0`).
- All lines FIFO-covered → preview collapsed by default, shortfall panel hidden, Mark-cooked enabled.
- User voluntarily switches a covered line to `external` → allowed.
- Picker returns 0 batches → row offers the external radio instead.
- `optional` line that would short → never surfaced in preview or shortfall list; no `batch_consumptions` row, no notes append.
- Override batch deleted between selection and submit → `ShortfallUnresolved`; modal re-prompts.
- Scale change mid-session → resolution map reset; user re-picks (no partial-state retention).
- Override unit ≠ line canonical unit → rejected server-side; picker filters unit-incompatible batches.

## Acceptance criteria

A `[~]` mark means the component/logic is built and unit-tested in isolation but
is **not reachable in the live cook modal** because `prepareCook` emits no
shortfalls and the modal hardcodes an empty shortfall set (see Status + the
live-wiring idea). Those rows are not satisfied end-to-end.

Panel rendering

- [x] `ConsumePreviewPanel` lists every resolved line (fifo / batch-override / partial / external) with batch reference(s) and per-line qty.
- [~] Panel auto-collapses when there are no shortfalls; expands when any shortfall exists. (Built + unit-tested, but the live modal always passes `hasShortfalls={false}`, so the expand-on-shortfall branch never fires in production.)
- [x] "Show all" expander reveals the collapsed tail of a long covered-line list.

Shortfall resolution

- [~] `ShortfallList` lists every unresolved shortfall; `ShortfallRow` offers the three resolution radios. (Built + unit-tested via a synthetic host; the live modal mounts `ShortfallList` with an empty `shortfalls` array, so nothing renders.)
- [~] `BatchOverridePicker` searches across batches via `/batches/search-for-consume`, default sort = expiry FIFO. (Picker + endpoint are built and tested; the picker is only mounted from `ShortfallRow`, which the live modal never renders.)
- [~] "Mark consumed externally" resolves the shortfall and updates the resolution map. (Logic built + unit-tested; not reachable from the live modal.)
- [~] `partial` mode splits the need between batch + external, auto-suggesting `externalQty = needed - available`. (Logic built + unit-tested; not reachable from the live modal.)

Gating

- [~] Mark-cooked is disabled while `unresolvedShortfallCount > 0`. (The gate is wired into `CookModal.canSubmit`, but in production `unresolvedShortfallCount` is always `0` because the modal feeds no shortfalls — the gate is inert.)
- [x] `POST /cook/mark-cooked` returns `ShortfallUnresolved` when overrides don't cover the (full-scaled) shortfall.

REST

- [x] `POST /batches/search-for-consume` returns `BatchForConsumeRow[]` matching the schema; FIFO-sorted; non-deleted, non-empty only.
- [x] `ConsumptionOverride` shape matches the `/cook/mark-cooked` body union.

State

- [x] `useCookResolution` reseeds the resolution map and bumps `scaleResetSignal` on a scale change (verified by the hook's own unit test).
- [x] Resolution map is local to the modal session.
- [x] `useCookResolution` exposes `resolutionMap`, `setResolution`, `unresolvedShortfallCount`, `scaleResetSignal`.

Notes append

- [x] Each `external` (and the external portion of `partial`) appends an audit token to `recipe_runs.notes` server-side.
- [x] Final notes are capped at 1000 chars.

Tests

- [~] FE: `ShortfallList`, `BatchOverridePicker`, `ConsumePreviewPanel`, `CookModal`, `useCookResolution` (RTL + Vitest) — resolve via override/external/partial, enable-exactly-when-resolved, scale reset. (Present, but the shortfall-resolution/gating/scale-reset scenarios run against a synthetic test host that injects fabricated shortfalls; the `CookModal.test.tsx` suite itself does not exercise a real shortfall through the wired modal.)
- [x] Server: `cook.test.ts` + `batches.test.ts` — batch-override writes one row, external writes none + notes append, partial writes one + notes, optional lines silently skip, depleted batch → `ShortfallUnresolved`.

## Out of scope

Substitution-aware FIFO and a "what can I cook tonight?" solver (Epic 06); multi-batch overrides per line beyond `partial`; unit conversion at the override layer; saved override patterns / last-cooked autocomplete; override audit beyond `recipe_runs.notes`.
