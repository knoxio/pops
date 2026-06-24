# Cook Event Recording — Deferred Wiring

Forward-looking gaps around the shipped cook modal + `markCooked` transaction (`prds/cook-event-recording`). The server contract and the recipe-detail "Cook now" entry point are built; these remaining pieces are not.

## Plan-entry deep-link → auto-open the cook modal with `planEntryId`

The plan-entry edit sheet's "Mark cooked" button links to `/food/recipes/:slug?cook=<planEntryId>`. Today that navigation lands on the recipe page but nothing reads the `cook` search param: the modal does not auto-open, and `planEntryId` is never propagated into `CookModal`. The server already supports the link (`markCooked` does the race-safe conditional `plan_entries.recipe_run_id` UPDATE, and `prepareCook` accepts `planEntryId` for the servings-ratio default scale; `CookModal` already accepts a `planEntryId` prop that no caller sets).

Build: on `RecipeDetailPage`, read `?cook=<id>` via `useSearchParams`, open the cook flow, and pass `planEntryId` (and the plan's pre-filled scale) through `CookNowPortal` → `CookModal`. On close, clear the param so browser-back doesn't re-open. This closes the plan-entry "Mark cooked" → cook-modal round-trip end-to-end.

## Surface live server shortfalls into the resolution UI

`CookModal` constructs `useCookResolution` with a hardcoded `shortfalls: []`, so the consume-preview / shortfall panels (which are fully built) never receive real shortfalls. The happy path works; a cook that FIFO can't cover returns `ShortfallUnresolved` from the server but the modal has no path to feed those shortfalls back into the resolution map for the user to resolve via `batch-override` / `external` / `partial`.

Build: on a `ShortfallUnresolved` result (or via a pre-flight availability check), map the returned `shortfalls[]` into the `LineShortfall[]` the hook expects and re-render the modal so the user can resolve each line before re-submitting with `consumptionOverrides`. This is the wiring layer over the already-shipped consume-preview / shortfall panels.

## Cook-detail / run-history page and editable runs

`/food/recipes/:slug/runs/:id` does not exist; the success toast links to `/food/fridge?batch=<id>` instead. A completed `recipe_run` row is immutable — rating and notes can't be edited after the fact. Build a run-detail read page and an edit path for rating/notes if post-hoc correction becomes a real need.

## Out-of-scope cook variants

Deliberately excluded from v1: multi-cook batch (several recipes in one modal), full-screen cooking-mode view, voice input, and photo capture for the cook event. Revisit each only with a concrete user need.
