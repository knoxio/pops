# PRD-146: FIFO Consumption UI Integration

> Epic: [05 — Meal Planning & Batches](../../epics/05-meal-planning.md)

## Overview

The consume-preview + shortfall-resolution UX layered inside PRD-144's cook modal. Surfaces which batches PRD-108's FIFO helper will consume at the user's current scale factor; lets the user override a per-need batch choice (pick a different batch than FIFO's default); resolves shortfalls via either a batch override or a "consumed externally" marker that records the consumption-need without writing a `batch_consumptions` row. PRD-144's Mark cooked button is gated on this PRD's resolution state.

After this PRD, the user can cook a recipe with mixed inventory state (some lines fully covered, some shortfalls, some they want to override) and the cook still completes atomically — every line has a deterministic disposition before the cook mutation fires.

This PRD owns one collapsible "Consume preview" panel inside the cook modal. The panel auto-collapses in the happy path (no shortfalls, no overrides). Schema impact: zero — `batches`, `recipe_runs`, `batch_consumptions` are unchanged; the "consumed externally" marker is a service-layer concept that simply omits a `batch_consumptions` row for the affected line.

## Surface

Embedded inside PRD-144's cook modal between the field grid and the action buttons:

```
┌────────────────────────────────────────────────────────────────────┐
│ ... [PRD-144 fields above] ...                                     │
│                                                                     │
│  ▾ Consume preview (8 ingredient lines, 3 batches will be touched) │
│    chicken breast    1000 g  →  Batch #42 (1.2 kg, exp Jun 12)     │
│    onion             800 g   →  Batch #18 (500 g) + Batch #19 (300g)│
│    double cream      240 ml  →  Batch #51 (500 ml, exp Jun 9)      │
│    [Show 5 more lines that are fully covered]                       │
│                                                                     │
│  ▾ Shortfalls (2 unresolved)                                       │
│    garam masala      12 g    Available: 0 g                         │
│      ( ) Pick a batch: [select another variant ▼]                   │
│      ( ) Mark consumed externally                                   │
│    ginger            50 g    Available: 30 g (Batch #88)            │
│      ( ) Pick a batch: [override target ▼]                          │
│      ( ) Consume 30 g from #88 + mark 20 g externally               │
│                                                                     │
│  ───────────────────────────────────────────────────────────────    │
│  [Cancel]                                  [Mark cooked]            │
└────────────────────────────────────────────────────────────────────┘
```

Panels:

1. **Consume preview** — always rendered when there are any covered lines. Collapsed by default; click to expand.
2. **Shortfalls** — rendered only when shortfalls exist. Expanded by default; collapsing is allowed but the Mark-cooked button stays disabled until every shortfall is resolved.

PRD-144's Mark-cooked button reads the resolution state from this PRD (via React state shared inside the modal). When `every shortfall has a resolution`, the button enables.

## Override and resolution model

For every consume need (one per recipe_lines row at the current scale), the UI tracks a `LineResolution`:

```ts
export type LineResolution =
  | { kind: 'fifo' } // accept the FIFO default (happy path)
  | { kind: 'batch-override'; batchId: number; consumeQty: number }
  // pick a specific batch; consumeQty defaults to min(need.qty, batch.qty_remaining)
  | { kind: 'external'; reasonNote?: string } // skip writing batch_consumptions for this line
  | { kind: 'partial'; batchId: number; consumeQty: number; externalQty: number };
// consume what's available + mark rest as external
```

Default state on modal open:

- Line that PRD-108's FIFO can fully cover → `kind: 'fifo'`.
- Line that PRD-108's FIFO can partially cover → `kind: 'fifo'` plus a shortfall entry (UI prompts to resolve the shortfall via `partial` or `external`).
- Line with zero matching batches → no `kind: 'fifo'` possible; shortfall entry with `available=0`; UI requires `batch-override` (different variant) or `external`.

`batch-override` is intentional — the user picks ANY batch (different variant, different prep_state) and assigns it to this line. Lets the user "I used whole onion instead of diced" without enabling Epic 06's substitution graph. The override is recorded in `batch_consumptions` against the chosen batch; the cook history reflects what was actually used. Future Epic 06 can add ranked suggestions; v1 is freeform.

`external` is the escape hatch for "I used something not tracked in batches" (the cabinet of forgotten spices, a friend gave me extra). The line generates NO `batch_consumptions` row; an entry is appended to `recipe_runs.notes` so the cook history reflects the gap: `"Line 12: garam masala (12g) consumed externally"`.

`partial` is the common case for "I have some but not enough" — consume what's available from one batch + mark the rest external.

## Components

```
packages/app-food/src/components/cook/
├── ConsumePreviewPanel.tsx        // PRD-146 — list of resolved lines + expand/collapse
├── ShortfallList.tsx              // PRD-146 — list of unresolved-need lines with per-row resolution UI
├── ShortfallRow.tsx               // PRD-146 — single shortfall with the three resolution options
├── BatchOverridePicker.tsx        // PRD-146 — search/select widget for picking a batch
└── useCookResolution.ts           // PRD-146 — local React state holding LineResolution map
```

`ConsumePreviewPanel` reads from the `useCookResolution` hook and renders the resolved lines (kind=fifo, kind=batch-override, kind=partial — anything with a `batchId` to display).

`ShortfallList` filters to lines whose resolution is incomplete (kind=fifo where shortfall exists; or unresolved shortfall entries with no kind yet).

`BatchOverridePicker` queries `food.batches.searchForConsume({ variantId?, ingredientId?, qtyGreaterThan? })` — a new query that returns batches with qty_remaining > 0, optionally filtered. Defaults to showing batches of the same ingredient (any variant) sorted by `expires_at ASC, produced_at ASC`.

## tRPC additions (PRD-145 amendment)

This PRD adds one query to PRD-145's `food.batches.*` router. PRD-145's spec enumerates create/relocate/edit/adjust/delete/get/searchForConsume — implementation imports `searchForConsume` from this PRD.

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.batches.searchForConsume: query({
  input: {
    ingredientId?: number,                          // filter to one ingredient's batches
    variantId?: number,                              // filter to one variant; takes precedence over ingredientId
    location?: 'pantry' | 'fridge' | 'freezer' | 'other',
    qtyGreaterThan?: number,                         // default 0 (only non-empty)
    limit?: number,                                  // default 20
  },
  output: { items: BatchForConsumeRow[] },
});

export type BatchForConsumeRow = {
  id: number;
  variantId: number;
  variantName: string;
  variantSlug: string;
  ingredientId: number;
  ingredientName: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  expiresAt: string | null;
  producedAt: string;
};
```

Used exclusively by `BatchOverridePicker`. Returns non-deleted, non-empty batches sorted by `expires_at ASC NULLS LAST, produced_at ASC` (matches FIFO order).

## Integration with PRD-144's cook mutation

PRD-144's `food.cook.markCooked` accepts `consumptionOverrides: ConsumptionOverride[]`. This PRD defines the shape:

```ts
export type ConsumptionOverride =
  | {
      lineIndex: number;
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      unit: 'g' | 'ml' | 'count';
    }
  | { lineIndex: number; kind: 'external'; externalQty: number; externalUnit: 'g' | 'ml' | 'count' }
  | {
      lineIndex: number;
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      unit: 'g' | 'ml' | 'count';
    };
```

`lineIndex` matches `recipe_lines.position` (PRD-116's column; 1-based per PRD-116 line 18-19, unique per `recipe_version_id` via `uq_recipe_lines_version_position`). PRD-108's `ConsumptionNeed` carries `(variantId, prepStateId, qty, canonicalUnit)` with no line-index field — so PRD-144's server flow does the per-line bookkeeping itself, then passes resolved needs (which may differ from the raw recipe_lines aggregation) to PRD-108's helper.

### Server flow inside PRD-144's `markCooked` mutation

PRD-144 step 5 ("Compute consume needs from `recipe_lines` × scale; merge with `consumptionOverrides`") expands as:

1. SELECT `recipe_lines` for the version, ORDER BY `position`.
2. Build a map `linesByPosition: Map<number, RecipeLine>`. Reject overrides with unknown `lineIndex`.
3. For each line:
   - If `optional=true`: **skip silently per PRD-108's contract.** Do not generate a need. Do not generate a `batch_consumptions` row. Do not write to `recipe_runs.notes`. The PRD-146 UI never surfaces optional lines in its shortfall list (filter at preview time).
   - Else if an override exists for `lineIndex`: apply per override kind:
     - `kind='batch-override'`: write a `batch_consumptions` row directly to `(runId, override.batchId, override.consumeQty, override.unit)`; decrement `batches.qty_remaining` accordingly. Do NOT add this line to the `needs` list passed to `consumeForRun`.
     - `kind='external'`: append a single line to `recipe_runs.notes` (`"Line <N>: <ingredient> (<qty><unit>) consumed externally"`). Do NOT add to `needs`. No `batch_consumptions` row.
     - `kind='partial'`: write a `batch_consumptions` row for the covered portion (as in `batch-override`) AND append the external portion to `recipe_runs.notes`. Do NOT add to `needs`.
   - Else (no override): scale the line's `qty_g | qty_ml | qty_count` by `scaleFactor` and append `{ variantId, prepStateId, qty, canonicalUnit }` to `needs`.
4. Call `consumeForRun(runId, needs, db)` with the override-stripped needs list. Any `Shortfall` returned by PRD-108 means a non-overridden line couldn't be FIFO-covered — that's a real shortfall and must trigger `ShortfallUnresolved`.
5. ROLLBACK on any shortfall; return `{ ok: false, reason: 'ShortfallUnresolved', shortfalls }`.

This keeps PRD-108's `ConsumptionNeed` shape unchanged. The line-index → batch mapping lives in PRD-144's server code; PRD-108's helper sees only the variant/prep/qty needs.

## Business Rules

- The `LineResolution` map is local to the modal session. Closing the modal discards it.
- Every shortfall must have a resolution before Mark-cooked enables. UI tracks `unresolvedShortfallCount` and binds it to the button's disabled state.
- `batch-override` allows picking a batch of a DIFFERENT variant or prep_state from what the recipe line requested. Cook history records what was actually used. PRD-108's FIFO query doesn't know about overrides; the cook mutation server-side reconciles.
- `external` markers are recorded in `recipe_runs.notes` (append, prefixed with `"Line N: <ingredient> (<qty><unit>) consumed externally"`). 1000-char cap (PRD-108's recipe_runs.notes); oldest entries truncate with `…`.
- `partial` is just `batch-override` + `external` for the same line; UI sugar over the API shape.
- Scale-factor changes invalidate the entire resolution map. UI prompts: "Scale changed; resolution reset." (Could be smarter — preserve overrides whose batchId is still applicable — but v1 plays it safe.)
- The "Show fully-covered lines" expander is collapsed by default to keep the modal tight; users with shortfalls see them up top regardless.
- Override batch must have `qty_remaining >= consumeQty` at submit time. Server-side check; if a concurrent cook depleted the batch, the mutation fails with `ShortfallUnresolved` (because the override no longer covers the need).

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe has 0 ingredient lines                                                                    | Both panels hide entirely. Mark-cooked is always enabled (the gating logic short-circuits when `unresolvedShortfallCount=0`).                                                                                                                                         |
| Recipe has 30 lines, all FIFO-covered                                                            | Consume preview collapsed by default ("30 lines covered"); shortfalls panel hidden. Mark-cooked enabled.                                                                                                                                                              |
| User switches a line from `fifo` to `external` voluntarily                                       | Allowed. PRD-146 doesn't restrict — the user knows their own kitchen. The mutation reflects.                                                                                                                                                                          |
| Batch override picker returns 0 batches (no matches)                                             | "No matching batches. Mark consumed externally instead." UI offers the external radio.                                                                                                                                                                                |
| User picks an override batch whose `prep_state_id` mismatches the recipe line                    | Allowed. Cook history reflects (the `batch_consumptions` row points to the actual batch). Future PRD (Epic 06) may surface this as a "substitution audit".                                                                                                            |
| User clicks "Mark cooked" with an unresolved shortfall                                           | Button is disabled; tooltip lists count. Defensive server-side check returns `ShortfallUnresolved`.                                                                                                                                                                   |
| Recipe line `optional=true` would-be shortfall                                                   | PRD-108's `consumeForRun` already skips optional lines silently. PRD-146's UI filters them out of the consume-preview and shortfall list (they never appear). No `batch_consumptions` row, no `recipe_runs.notes` append. Pure no-op aligned with PRD-108's contract. |
| User picks a batch override, then scale changes, then re-picks                                   | Resolution map reset on scale change; user picks fresh. No partial-state retention.                                                                                                                                                                                   |
| Override batch is deleted between selection and submit                                           | Server returns `ShortfallUnresolved` (the override's batch can't be touched). Modal re-fetches and re-prompts.                                                                                                                                                        |
| External-mark with `externalQty=0`                                                               | Allowed; equivalent to "no consumption needed for this line" (e.g. line was optional and user explicitly marked it). Recipe_runs.notes appends "Line N: <ingredient> (0g) noted as none required".                                                                    |
| Override batch's `unit` differs from the recipe line's `unit` (e.g. recipe wants ml, batch is g) | Disallowed in v1. Picker filters out unit-incompatible batches. PRD-123's conversion isn't applied at the cook layer.                                                                                                                                                 |
| Recipe has 50+ lines with mixed shortfalls                                                       | Shortfall list paginates with "Show all" expander after 10 items. Performance acceptable for typical recipes.                                                                                                                                                         |
| User collapses the shortfall panel then tries to submit                                          | Mark-cooked still disabled (state is independent of panel visibility). Disabled tooltip prompts to expand.                                                                                                                                                            |

## Acceptance Criteria

Inline per theme protocol.

### Panel rendering

- [ ] `ConsumePreviewPanel` lists every resolved line (kind=fifo / batch-override / partial) with the batch reference(s) and per-line qty.
- [ ] Panel auto-collapses when there are no shortfalls.
- [ ] "Show N more covered lines" expander works when the list is long.

### Shortfall resolution

- [ ] `ShortfallList` lists every unresolved shortfall with the three resolution options.
- [ ] `BatchOverridePicker` lets the user search across batches; default sort = expiry FIFO.
- [ ] `Mark consumed externally` radio resolves the shortfall and updates the resolution map.
- [ ] `partial` mode lets the user split the need between batch + external.

### Gating

- [ ] PRD-144's Mark-cooked button is disabled while `unresolvedShortfallCount > 0`.
- [ ] Server-side `food.cook.markCooked` returns `ShortfallUnresolved` when overrides don't cover the shortfall.

### tRPC

- [ ] `food.batches.searchForConsume` returns `BatchForConsumeRow[]` matching the schema; sorted FIFO; non-deleted, non-empty only.
- [ ] `ConsumptionOverride` shape matches PRD-144's input type.

### State

- [ ] Scale change resets the resolution map (with user-visible reset prompt).
- [ ] Resolution map is local to the modal session.
- [ ] `useCookResolution` hook exposes `resolutions`, `setResolution`, `unresolvedShortfallCount`.

### Notes append

- [ ] Each `external` resolution appends to `recipe_runs.notes` server-side with the spec'd format.
- [ ] 1000-char cap with `…`-prefix front-truncation.

### Tests

- [ ] Vitest + RTL at `packages/app-food/src/components/cook/__tests__/ShortfallList.test.tsx`:
  - 3 shortfalls; resolve via batch-override, external, partial.
  - Mark-cooked enables exactly when all resolved.
  - Scale change resets state.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/cook-overrides.test.ts`:
  - Cook with `kind='batch-override'` writes a `batch_consumptions` row to the specified batch.
  - Cook with `kind='external'` writes no `batch_consumptions` row; notes append correctly.
  - Cook with `kind='partial'` writes one `batch_consumptions` row + notes append.
  - Optional lines silently skip per PRD-108: no `batch_consumptions` row written, no `recipe_runs.notes` append, no UI surfacing.
  - Override batch depleted between read and write → `ShortfallUnresolved`.

## Out of Scope

- Substitution-aware FIFO (consume whole onion when recipe asks for diced, automatically) — **Epic 06**.
- "What can I cook tonight?" solver that pre-filters recipes by available batches — **Epic 06**.
- Multi-batch overrides per line beyond the `partial` shape (e.g. "use 100g from #18, 50g from #22, 30g from #19") — out of scope in v1; PRD-108's FIFO handles multi-batch automatically when no override is set.
- Unit conversion at the override layer (override a g-batch when the line is in ml) — out of scope; PRD-123's services aren't called in the cook layer per PRD-108.
- Saving override patterns ("always use the freezer batch for X") — out of scope.
- A "last cooked override" autocomplete that pre-fills choices from prior cooks — out of scope.
- Override audit beyond `recipe_runs.notes` — out of scope; a future analytics PRD could surface override patterns.
- Confidence display on override picks ("this batch expires soonest") — picker sort is enough.

## Requires (cross-PRD dependencies)

- **PRD-108** — `batches` / `batch_consumptions` schema; `consumeForRun` FIFO helper (PRD-146's overrides reconcile against its defaults at the cook mutation server-side).
- **PRD-116** — `recipe_lines.position` for `lineIndex` reference; `recipe_lines.optional` for the auto-resolve rule.
- **PRD-144** — owns the cook modal that embeds PRD-146's panels; the `ConsumptionOverride[]` input on the cook mutation is consumed here.
- **PRD-145** — `food.batches.*` services (this PRD adds `searchForConsume` to the same router).

## Subsequent amendments

Pointers — not a spec change.

- **PRD-149** (Cook-time substitutions): `BatchOverridePicker` extended with a Substitutions section; `ConsumptionOverride` gains optional `substitutionEdgeId` on the `batch-override` and `partial` kinds. Server-side override-resolution in PRD-144's `markCooked` mutation gains a substitution-detection branch that writes audit notes to `recipe_runs.notes`.
