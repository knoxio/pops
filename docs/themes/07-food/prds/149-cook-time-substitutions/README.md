# PRD-149: Cook-Time Substitution Suggestions

> Epic: [06 — Substitutions & Solver](../../epics/06-substitutions.md)

## Overview

Amend PRD-146's batch-override picker so the dropdown surfaces substitutions from PRD-109 alongside same-variant batches. When the user hits a shortfall for "diced onion" and clicks "Pick a batch ▼", the picker shows two sections: (1) Same-variant batches (current PRD-146 behaviour) and (2) Substitutions — every valid sub-edge for the line's variant with available batches, ranked by ratio fit + context-tag overlap + expiry. Picking a sub fills the override with the sub's batch but records the `batch_consumptions` row against that sub-batch + appends the substitution metadata to `recipe_runs.notes`.

After this PRD, "I'm out of butter — what can I use?" surfaces inside the cook modal without a separate step. Substitutions become a first-class resolution path equal to same-variant overrides.

This PRD is a **PRD-146 amendment** + a new `food.substitutions.resolveForLine` query owned by Epic 06. Zero schema changes.

## Picker layout (PRD-146 amendment)

PRD-146's `BatchOverridePicker` currently lists same-variant batches. After this PRD:

```
Pick a batch for "onion (diced, 200g)" ▼
─────────────────────────────────────────
SAME VARIANT (2)
  Batch #18 — yellow onion, diced — 500g, Fridge, exp Jun 10
  Batch #19 — yellow onion, diced — 300g, Fridge, exp Jun 12

SUBSTITUTIONS (3)
  ◆ Shallot — Batch #34 (200g, Fridge, exp Jun 11)
      ratio 1.0, savory, frying
  ◆ Leek — Batch #28 (400g, Fridge, exp Jun 9)
      ratio 1.5, savory
  ◆ Yellow onion / whole — Batch #45 (5 count, Pantry)
      ratio 1.0, no context tags
      ⚠ different prep — recipe needs diced
─────────────────────────────────────────
[Cancel]                          [Select]
```

Section ordering: **Same-variant first** (preferred path); Substitutions second.

### Section: Same-variant

Unchanged from PRD-146. Lists batches matching the line's `variant_id` (any prep_state). Sorted FIFO by expiry.

### Section: Substitutions

Each row represents `(substitution edge, candidate batch)` pair:

- **From the recipe's line's variant** → walk PRD-109's substitutions to find every valid edge.
- For each edge's `to` side (the substitute), find every non-empty, non-deleted batch in the fridge.
- Cross-product: edge × batch. Each row is one such pair.

Sort within the Substitutions section by:

1. **Ratio match** ASC by `|ratio − 1.0|` (closer to identity = higher up).
2. **Context-tag overlap** DESC (more overlap with the recipe's tags = higher).
3. **Batch expiry** ASC NULLS LAST (sooner-expiring = higher).
4. **Ingredient name** ASC (deterministic tie-break).

Each row shows:

- ◆ icon to distinguish from same-variant rows.
- **Substitute name** (ingredient + variant + prep_state if applicable).
- **Batch reference** (id, qty, location, expiry).
- **Ratio + context tags** — second line in muted text.
- **Warning chip** when the sub's prep_state differs from the recipe's line's prep_state. Doesn't block selection; informs.

### Picking a substitution

Click → fills the override with:

- `batchId` = the candidate batch's id.
- `consumeQty` = `lineQty × substitution.ratio × scaleFactor`. UI shows the computed value; user can adjust before confirming.
- `unit` = the batch's unit.
- An internal flag `substitutionEdgeId` carried through to the cook mutation (NEW field on `ConsumptionOverride`, see below).

On Mark Cooked: server writes a `batch_consumptions` row to the chosen sub's batch + appends `"Line N: <ingredient> substituted with <sub> (ratio <r>, batch #<id>)"` to `recipe_runs.notes`. Cook history preserves both the original intent and the actual consumption.

## tRPC API

### New query (Epic 06 ownership)

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.substitutions.resolveForLine: query({
  input: {
    recipeVersionId: number,
    lineIndex: number,                             // recipe_lines.position (1-based per PRD-116)
  },
  output: SubResolution,
});

export type SubResolution = {
  lineIndex: number;
  lineVariantId: number;
  lineVariantName: string;
  linePrepStateId: number | null;
  linePrepStateLabel: string | null;
  lineQty: number;                                 // canonical qty at scale=1
  lineUnit: 'g' | 'ml' | 'count';
  recipeContextTags: string[];                     // from recipe_versions / recipes.tags — used for context filtering
  candidates: SubCandidate[];
};

export type SubCandidate = {
  substitutionId: number;                          // substitutions.id
  ratio: number;
  contextTags: string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;                         // null when scope='global'
  substituteVariantId: number;                     // resolved to a variant (ingredient-level edges resolve to canonical variant)
  substituteVariantName: string;
  substituteIngredientId: number;
  substituteIngredientName: string;
  notes: string | null;
  batches: SubCandidateBatch[];                    // every non-deleted, non-empty batch for the substitute variant
};

export type SubCandidateBatch = {
  batchId: number;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  expiresAt: string | null;
  prepStateId: number | null;
  prepStateLabel: string | null;                   // for the prep-mismatch warning
};
```

### `resolveForLine` server-side flow

1. SELECT the `recipe_lines` row for `(recipeVersionId, lineIndex)`. Reject if not found.
2. Read recipe context tags: SELECT `recipe_tags` for `recipes.id` of this version's recipe.
3. SELECT substitution edges matching: `(from_ingredient_id = lineVariant.ingredient_id OR from_variant_id = lineVariantId)` AND `(scope='global' OR (scope='recipe' AND recipe_id = recipe.id))`.
4. Apply context-tag filter: PRD-109's `json_each` query passes an OR set of context tags via parameter `:C` (PRD-109 line 71-74). This PRD pins `:C` = the recipe's `recipe_tags` list. Per PRD-109's rule, a sub with empty `context_tags` is a wildcard (matches any `:C`); a sub with non-empty tags matches iff at least one tag overlaps `:C`. If the recipe has no `recipe_tags`, only wildcard subs surface (since the OR set is empty).
5. Resolve per-recipe overrides over global. **PRD-109 amendment**: PRD-109 line 77 documents override-by-`from` (a recipe-scoped row from `butter` shadows ALL global rows from `butter`). Epic 06 finds that rule too aggressive — a per-recipe "butter → coconut-oil with ratio 0.5" should NOT shadow the global "butter → olive-oil 0.75" for that recipe. This PRD refines: override is by `(from_*, to_*)` pair — only the matching global edge is shadowed. Other global edges from the same `from` still apply. PRD-148 and PRD-150 follow the same refined rule.
6. For each remaining edge: SELECT batches where `variant_id = edge.to_variant_id` (or any variant of `edge.to_ingredient_id` when the `to` side is ingredient-level), `qty_remaining > 0`, `deleted_at IS NULL`. Sort each candidate's batches by FIFO.
7. Return `SubResolution` with the candidates list. Empty candidates = no valid subs.

One round-trip. Cached client-side per `(recipeVersionId, lineIndex)` for the modal session. The returned `lineQty` is canonical at scale=1; the picker multiplies by the current `scaleFactor` (from `useRecipeScale()` per PRD-119's amendment) when computing the displayed and submitted `consumeQty`. PRD-146's "scale change resets the resolution map" rule still applies — switching scales invalidates the picker's selection.

### `ConsumptionOverride` extension (PRD-146 amendment)

PRD-146's `ConsumptionOverride` type gains an optional `substitutionEdgeId`:

```ts
export type ConsumptionOverride =
  | {
      lineIndex: number;
      kind: 'batch-override';
      batchId: number;
      consumeQty: number;
      unit: 'g' | 'ml' | 'count';
      substitutionEdgeId?: number;
    } // NEW — set when the override came from a sub suggestion
  | { lineIndex: number; kind: 'external'; externalQty: number; externalUnit: 'g' | 'ml' | 'count' }
  | {
      lineIndex: number;
      kind: 'partial';
      batchId: number;
      consumeQty: number;
      externalQty: number;
      unit: 'g' | 'ml' | 'count';
      substitutionEdgeId?: number;
    }; // NEW — set when the partial's batch came from a sub suggestion
```

Server-side flow inside PRD-144's `food.cook.markCooked`:

- When `substitutionEdgeId` is set on a `batch-override` or `partial`, the server:
  - Validates the edge exists, isn't self-referential, and resolves to the chosen batch's variant.
  - Writes a `batch_consumptions` row against the chosen batch (unchanged from PRD-146 logic).
  - **Appends to `recipe_runs.notes`**: `"Line <N>: <ingredient> substituted with <sub-ingredient> (ratio <r>, batch #<id>)"`. Preserves the substitution audit trail in cook history.

This is a PRD-144 amendment AND a PRD-146 amendment — the override shape gains a new optional field; the mutation server logic gains the substitution-detection branch.

## Components

```
packages/app-food/src/components/cook/
├── BatchOverridePicker.tsx                       // EXISTING (PRD-146) — extend
├── SubstitutionCandidateRow.tsx                  // NEW (PRD-149)
└── useSubstitutionResolution.ts                  // NEW (PRD-149) — wraps food.substitutions.resolveForLine
```

`BatchOverridePicker` is extended:

- Reads same-variant batches via existing `food.batches.searchForConsume` (PRD-146).
- Reads substitutions via new `food.substitutions.resolveForLine` (this PRD).
- Renders both sections in the dropdown body.
- Section headers are sticky as the user scrolls.
- "Show all" expander appears when the Substitutions section has >5 candidates (cap initial display at 5, ranked).

## Business Rules

- Substitutions surface only inside the override picker. They do NOT auto-resolve shortfalls — the user explicitly picks.
- Recipe-scoped substitutions take precedence over global for the same `(from, to)` pair, per PRD-109.
- Single-hop only (PRD-109 rule). The picker never chains A→B→C.
- A substitution with an empty `context_tags` array applies in any context (wildcard).
- A substitution with tags applies iff at least one tag overlaps with the recipe's tags. Recipes with no tags accept all subs.
- Prep-state mismatch is informational, not blocking. UI shows ⚠; user decides.
- The picker caps the displayed Substitutions section at 5 by default with a "Show all (N)" expander.
- Picking a substitution computes `consumeQty = lineQty × ratio × scaleFactor`. User may edit before confirming.
- The cook mutation writes the substitution metadata to `recipe_runs.notes` for audit.
- A substitution batch's prep_state may differ from the recipe line's; the consumption is still recorded against the batch as-is.

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe line variant has 5 substitutions defined, but 0 of them have batches       | Substitutions section renders the edges with "(no batches)" beneath each. Cannot be selected. User picks `external` instead.                                                        |
| Recipe has 3 tags; substitution has 2 tags, 1 overlapping                         | Substitution surfaces (≥1 overlap).                                                                                                                                                 |
| Recipe has 0 tags                                                                 | All substitutions surface (wildcard rule + no-tag-side defaults).                                                                                                                   |
| User picks a sub, then changes scale factor                                       | PRD-146 already resets the resolution map on scale change. The sub pick is lost; user re-picks at the new scale.                                                                    |
| Recipe-scoped sub exists for the active recipe AND a global sub for the same pair | Only the recipe-scoped row surfaces (global is hidden per PRD-109's override rule).                                                                                                 |
| Substitution edge is `from_ingredient_id` (ingredient-level)                      | Server resolves to the canonical variant. The substitute side may be ingredient-level too; UI labels accordingly.                                                                   |
| Sub's `to` is ingredient-level; batches exist under multiple variants of it       | Each variant's batches surface as separate candidate rows under the same `substitutionEdgeId`.                                                                                      |
| Two sub-edges resolve to the same target batch (cross-product)                    | Two separate rows render. Distinct `substitutionEdgeId` values; the user picks which framing makes sense.                                                                           |
| Mid-flight: sub graph edited while picker is open                                 | Picker uses cached data for the session. Refreshing the picker re-fetches. No race correctness issue (cook mutation server-side re-validates the chosen edge).                      |
| User picks a sub that no longer exists at submit time                             | `food.cook.markCooked` returns `SubstitutionEdgeInvalid` when the edge is gone. (If the edge still exists but the sub's batch was depleted, returns `ShortfallUnresolved` instead.) |
| Network drops between picker open and selection                                   | Picker shows the cached data; selection works against it; mutation fails server-side if the edge is gone.                                                                           |
| Sub edge with `notes`                                                             | Notes render inline in the picker row (truncated to 80 chars, full on tooltip).                                                                                                     |
| Sub batch's `unit` differs from the recipe line's `unit`                          | Same as PRD-146 — filtered out of the candidate list (unit conversion is not applied at the cook layer).                                                                            |

## Acceptance Criteria

Inline per theme protocol.

### Picker rendering

- [ ] `BatchOverridePicker` dropdown renders two sticky-header sections: Same-variant, Substitutions.
- [ ] Substitutions section caps at 5 visible; "Show all (N)" expander reveals the rest.
- [ ] Same-variant rows render unchanged from PRD-146.
- [ ] Substitution rows show ◆ icon, sub name, batch ref, ratio + tags line, prep-mismatch ⚠ when applicable.

### Ranking

- [ ] Substitutions section sorts by `|ratio-1.0| ASC`, then context-tag overlap DESC, then expiry ASC NULLS LAST, then ingredient name ASC.
- [ ] Sort verified by a Vitest fixture with multiple edges at the same ratio.

### Picking a substitution

- [ ] Selecting a sub fills the override with `batchId`, `consumeQty = lineQty × ratio × scaleFactor`, `unit = batch.unit`, `substitutionEdgeId = edge.id`.
- [ ] User can adjust `consumeQty` before confirming.
- [ ] PRD-146's resolution map records the override correctly.

### Cook mutation (PRD-144 amendment)

- [ ] `food.cook.markCooked` accepts the extended `ConsumptionOverride` shape with `substitutionEdgeId`.
- [ ] Server validates the edge exists and resolves to the chosen batch's variant; rejects with a new error code `SubstitutionEdgeInvalid` (added to `MarkCookedError` enum) when it doesn't.
- [ ] Server appends substitution audit line to `recipe_runs.notes` on successful cook.

### tRPC

- [ ] `food.substitutions.resolveForLine` exists in `apps/pops-api/src/modules/food/router.ts`.
- [ ] Returns `SubResolution` matching the schema; one round-trip.
- [ ] Recipe-scoped subs override global per PRD-109's rule.
- [ ] Context-tag filter applies per PRD-109's wildcard + overlap rule.
- [ ] Empty `candidates` array when no valid subs exist.

### Tests

- [ ] Vitest + RTL at `packages/app-food/src/components/cook/__tests__/BatchOverridePicker.test.tsx`:
  - Renders both sections with seeded substitutions + batches.
  - Substitution row selection fills the override correctly.
  - Prep-state mismatch chip renders.
  - "Show all" expander works.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/substitutions-resolve.test.ts`:
  - `resolveForLine` returns candidates ordered per the sort rules.
  - Recipe-scoped edges win over global.
  - Wildcard tag rule (empty context_tags) applies.
  - Context-tag overlap filter excludes non-overlapping subs (when recipe has tags).
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/cook-substitution.test.ts`:
  - Cook with `substitutionEdgeId` set writes `batch_consumptions` + appends substitution note.
  - `SubstitutionEdgeInvalid` error fires when the edge is gone at submit time.

## Out of Scope

- Suggesting substitutions outside the cook modal (e.g. on the recipe detail page next to ingredient lines) — out of scope; future PRD.
- Multi-hop chains (A→B→C) — PRD-109 rule.
- Substitution suggestions ranked by historical user picks — out of scope; would require an event log.
- Automatic substitution application (one-click "cook with default subs") — out of scope; user picks.
- Unit conversion when the sub batch's unit differs from the recipe line — out of scope (matches PRD-146's same-variant rule).
- Substitution suggestions for the yield (e.g. "this recipe yields X; could yield Y instead") — out of scope.
- Per-line "show me alternative ingredients" preview before the user clicks override — out of scope; user must hit a shortfall or open the picker to see subs.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients` / `ingredient_variants` / `prep_states` (names, slugs).
- **PRD-107** — `recipes` / `recipe_versions` / `recipe_tags` for context filtering.
- **PRD-108** — `batches` schema; `batches.deleted_at` (PRD-145 column).
- **PRD-109** — `substitutions` schema; precedence rules (recipe over global); wildcard context_tags rule.
- **PRD-116** — `recipe_lines.position` (lineIndex match), `recipe_lines.variant_id`, `recipe_lines.prep_state_id`.
- **PRD-144** — Amendment: `MarkCookedError` enum gains `SubstitutionEdgeInvalid`; server flow gains substitution-detection branch that writes audit notes.
- **PRD-145** — `food.batches.*` services (read-side reuse).
- **PRD-146** — Amendment: `ConsumptionOverride` types gain optional `substitutionEdgeId` field; `BatchOverridePicker` extended.
- **PRD-150** — Owns the shared substitution-resolution service at `apps/pops-api/src/modules/food/services/substitutions-resolve.ts`. This PRD's `food.substitutions.resolveForLine` tRPC procedure imports and wraps that service. PRD-150's solver calls it directly per-line.
