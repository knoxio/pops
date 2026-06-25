# Idea: Data-page extensions

Forward-looking work deliberately excluded from the shipped [data-page](../prds/data-page.md). The page (six tabs, CRUD, global search, deep-link focus) is done; these are the next layers.

## Ingredient list filters & pagination

`GET /ingredients` filters today on `search` substring and `parentId` only. The original design called for two more affordances on the Ingredients tree:

- **"Has variants"** filter chip — show only ingredients with at least one `ingredient_variants` row.
- **"Has no recipes referencing"** filter chip — show orphan ingredients (no compiled `recipe_lines` reference), the prime candidates for archival/cleanup.

Both need the list endpoint extended with `hasVariants?: boolean` and `hasNoRecipeRefs?: boolean` query flags plus the supporting joins, and the tree UI to render the chips. While in there, add keyset pagination (`limit` + `cursor`) — the current list returns the full catalogue in one shot, which is fine at seed scale but will not hold as the catalogue grows.

## Bulk archive / multi-select on Ingredients

The page is single-row today. A multi-select mode on the tree (select N ingredients, archive/delete the safe ones in one pass, surfacing per-row blockers) would speed up post-ingest cleanup. This is also the prerequisite the Tags tab (read-only in v1) calls out for a rename/merge/bulk-retag flow.

## Storybook coverage for the full page

Per-tab stories exist (Aliases, Prep states, Substitutions tables). A single aggregate `DataPage` story that mounts the layout with all six tabs against a fixture — useful for visual regression of the tab strip, mobile dropdown collapse, and global-search dropdown — has not been built.

## Auto-create banner deep-link (cross-PRD)

The recipe-create flow can mint new ingredients on compile. The intended UX is a "Recipe created N new ingredients" banner whose entries link to `/food/data/ingredients?focus=<slug>` so the user lands on each new row to curate it. The destination side (focus + 2s highlight + not-found toast) is built and tested; the banner that links here lives in the recipe-create surface and is still to be wired.

## CSV / JSON import-export of ingredient lists

The seed is the only programmatic input today. A round-trip import/export (CSV or JSON) of the ingredient catalogue — for bootstrapping from an external list or backing up edits — is out of scope for v1.
