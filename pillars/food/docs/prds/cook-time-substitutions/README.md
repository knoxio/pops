# Cook-Time Substitutions

Status: **Done** — `GET /substitutions/resolve-line` resolves per-line substitution candidates with batch coverage; the cook modal's `BatchOverridePicker` renders a Substitutions section beside same-variant batches; the cook write path validates the chosen edge and appends an audit note. Forward-looking extensions live in `../../ideas/substitution-suggestion-extensions.md`.

When the cook modal hits a shortfall for a line ("out of butter"), the batch-override picker surfaces valid substitution edges alongside same-variant batches. Picking a substitution fills the override with the sub's batch, records the `batch_consumptions` row against that batch, and appends a machine-readable substitution audit line to `recipe_runs.notes`. Substitutions are a first-class resolution path equal to same-variant overrides — the user explicitly picks; nothing auto-resolves.

## Data model (reused, no new tables)

`substitutions`: `id`, `from_ingredient_id` XOR `from_variant_id`, `to_ingredient_id` XOR `to_variant_id`, `ratio` (REAL, `> 0`, default 1.0; 1 unit of substitute = `ratio` units of original), `context_tags` (JSON array; `[]` = wildcard), `scope` (`global` | `recipe`), `recipe_id` (set iff `scope='recipe'`), `notes`, `created_at`. CHECK constraints enforce both XOR endpoints, the scope↔recipe_id coupling, and positive ratio.

Read-side joins reuse `ingredients`, `ingredient_variants`, `prep_states`, `recipes` / `recipe_versions` / `recipe_tags`, `recipe_lines` (line position + `variant_id` + `prep_state_id` + canonical qty/unit), and `batches` (`qty_remaining`, `unit`, `location`, `expires_at`, `prep_state_id`, `deleted_at`).

## REST API surface

- `GET /substitutions/resolve-line?recipeVersionId&lineIndex` → `SubResolution` (one round-trip). 404 when the `(recipeVersionId, lineIndex)` line is absent.
- `POST /cook/mark-cooked` — `ConsumptionOverride[]` carries an optional `substitutionEdgeId` on `batch-override` and `partial` rows.

`SubResolution` carries `lineIndex`, `lineVariantId`, `lineVariantName`, `linePrepStateId`/`Label`, canonical `lineQty` (at scale=1), `lineUnit`, `recipeContextTags`, and `candidates`. Each candidate: `substitutionId`, `ratio`, `contextTags`, `scope`, `recipeId`, `substituteVariantId`/`Name`, `substituteIngredientId`/`Name`, `notes`, and `batches[]` (`batchId`, `qtyRemaining`, `unit`, `location`, `expiresAt`, `prepStateId`/`Label`). Ingredient-level `to` edges fan out into one candidate row per target variant; candidates with zero batches are returned (rendered as un-pickable "no batches").

## Business rules

- [x] `resolve-line` matches edges whose `from` equals the line's ingredient (any variant) OR the line's variant (pinned). Single-hop only — never chains A→B→C.
- [x] `(from, to)`-pair override: a recipe-scoped edge supersedes only the global edge with the same `(from, to)` pair; other global edges out of the same `from` survive.
- [x] Context-tag OR-overlap: an empty `context_tags` array is a wildcard (matches any recipe); a non-empty array matches iff ≥1 tag overlaps the recipe's `recipe_tags`. A recipe with no tags accepts only wildcard subs.
- [x] The resolver returns the full candidate set; ranking + the 5-item display cap live in the picker UI (kept out of the DB layer so the frontend sort is independently testable).
- [x] Picker ranks the Substitutions section by `|ratio − 1.0|` ASC, then recipe-tag overlap DESC, then earliest batch expiry ASC NULLS LAST, then ingredient name ASC.
- [x] Picking a sub fills the override with `batchId`, `substitutionEdgeId = candidate.substitutionId`, `unit = batch.unit`, and `consumeQty = min(batch.qtyRemaining, need.qty / ratio)` — substitute units needed to cover the (already-scaled) original need. Partial picks split the remainder into `externalQty`.
- [x] On `mark-cooked`, when `substitutionEdgeId` is set the server validates the edge exists AND the chosen batch's variant matches the edge's `to` side (`to_variant_id`, or any variant of `to_ingredient_id`); otherwise `SubstitutionEdgeInvalid`. Prep-state mismatch is tolerated for substitution draws (the line's expected variant is repinned to the sub batch's variant).
- [x] A successful substitution draw decrements the batch, inserts a `batch_consumptions` row, and appends `cook-override:substitution line=<n> edge=<id> ratio=<r> batch=<id> sub=<ingredient>/<variant>` to `recipe_runs.notes` for audit. Same-variant and `external` overrides keep their own audit-line formats.
- [x] An override is only marked "covered" (bypassing FIFO) when it accounts for the full scaled need and its unit equals the line's canonical unit; otherwise `ShortfallUnresolved`. Overrides on optional lines are silently dropped.

## UI

`BatchOverridePicker` (`app/src/components/cook/`) renders one dropdown with two sticky-header sections:

- [x] **Same-variant** — batches matching the line's `variant_id` via `POST /batches/search-for-consume`, FIFO by expiry (unchanged behaviour).
- [x] **Substitutions** — `(edge × batch)` rows via `useSubstitutionResolution` → `resolve-line`. Each row shows a ◆ marker, substitute ingredient + variant, batch ref (`#id`, qty, expiry), a ratio + context-tags line, and an amber prep-mismatch ⚠ when the batch's `prep_state_id` differs from the line's. Caps at 5 visible with a "Show all (N)" expander; loading / error / empty states render in place. "No batches" candidates render disabled.

## Edge cases

- [x] Line variant has subs defined but none have batches → edges render with "(no batches)", un-pickable; user falls back to `external`.
- [x] Recipe has 0 tags → only wildcard subs surface. Recipe tag overlaps ≥1 of a sub's tags → sub surfaces.
- [x] Recipe-scoped sub + global sub for the same `(from, to)` pair → only the recipe-scoped row surfaces; other global edges from the same `from` still surface.
- [x] Ingredient-level `to` with batches under multiple variants → one candidate row per variant.
- [x] Sub edge picked but gone at submit time → `SubstitutionEdgeInvalid`. Edge present but the batch lacks qty → `ShortfallUnresolved`.
- [x] Sub batch's unit differs from the line's canonical unit → the override is rejected by the coverage check (no cook-layer unit conversion; matches same-variant rule).

## Acceptance criteria (verified by tests)

- [x] `src/api/__tests__/substitutions.test.ts` — `resolve-line` maps an unknown `(recipeVersionId, lineIndex)` to 404.
- [x] `src/api/__tests__/cook.test.ts` (substitution-override block) — sub override draws from the sub batch and writes the audit line; `SubstitutionEdgeInvalid` for an unknown edge and for a batch whose variant misses the edge's `to` side.
- [x] `app/src/components/cook/__tests__/substitution-ranking.test.ts` — sort tie-breaks pinned.
- [x] `app/src/components/cook/__tests__/BatchOverridePicker.test.tsx` — both sections render; sub-row selection fills the override; prep-mismatch chip; "Show all" expander.

## Cross-pillar / contract notes

Cross-pillar calls go through the `@pops/pillar-sdk` client; the food contract is served under `pillars/food/src/contract/rest-*.ts` and projected to OpenAPI consumed by the app via the generated `food-api` client. The substitution graph CRUD + graph-view + hydrated list share the same `substitutions.*` sub-router (`rest-substitutions.ts`).
