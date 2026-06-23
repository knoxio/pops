# Fridge View — Deferred Extensions

Forward-looking work on top of the shipped `/food/fridge` page (`prds/fridge-view`). None of these are built; the v1 page deliberately keeps filter and modal state local and the layout flat.

## URL-driven page state + deep-link

Filter, show-all, and modal state are local React state today — none of it lives in the URL. Build `useSearchParams` sync so these become shareable / reload-stable:

- `?showAll=1` — open the page with empties + soft-deleted rows visible.
- `?add=1` — render the Add-batch modal overlaid on load.
- `?edit=<id>` — render the Edit modal for a batch on load.
- `?batch=<id>` — the deep-link from a batch-created success toast: auto-scroll to the row and apply a ~2s highlight pulse. If current filters hide the target, auto-expand show-all and reset the location filter. For a soft-deleted target, auto-toggle show-all, scroll to it in the deleted subsection, and toast "This batch was deleted on `<date>`." The page already tags each row with `data-batch-id`, so the scroll target exists.

## Sidebar badge for expiring batches

The Food sub-nav "Fridge" entry has no badge. Add a count of batches with `expires_at` within 3 days, plus a small red dot when any are already expired. The `daysToExpiry` projection already exists in `fridge.view`; the badge needs a lightweight count source (a dedicated count endpoint or a reuse of the view's `counts`) so the shell can render it without loading the whole page.

## Ingredient sub-grouping collapse

`LocationSection` renders every ingredient group flat. Add a collapse affordance that kicks in only when one ingredient has >3 variants in the same location (e.g. "Chicken (3 batches)" with an expand caret), so a location with many variants of one ingredient stays scannable. Default expanded otherwise.

## Live refresh while visible

The view does not poll. Add a ~60s refetch while the page is visible (and pause while a modal is open, since modals own a snapshot of the row data taken at open time and a refetch mid-edit would clobber it). Today the user must change a filter or trigger a mutation to see fresh data.

## Mobile bottom-sheet modals

The Add / Edit / Relocate / Adjust / Delete / Cook modals render as centered dialogs on all viewports. Add a bottom-sheet variant on small screens (≤375px) so the controls are thumb-reachable.

## Prep-state filter chip

The view contract exposes search, location, expiring-soon, and recipe-yielded filters but no prep-state filter. Add a `prepStateId` to the `fridge.view` body, a `prep_state_id =` clause in the view query, and a filter chip in `FridgeFilterBar`, once the design settles on single- vs multi-select.

## Prep-aware "Cook now" solver

The Cook-now picker joins recipes to a batch on `variant_id` only — it is not prep-aware, so it can surface a recipe needing diced onion for a sliced batch. The `~` prefix on "Needs ~Xg" signals this imprecision. Replace the variant-only join with a real "what can I cook" solver that understands prep-state compatibility and the substitution graph (overlaps with the broader meal-solver epic).
