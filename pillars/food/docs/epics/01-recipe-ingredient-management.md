# Epic 01: Recipe & Ingredient Management

> Theme: [Food](../README.md)

## Scope

Build the user-facing surfaces for everything Epic 00 laid down in schema: `app-food` as a shell-registered module; recipe CRUD pages (list, detail, new, edit, promote, archive); a CodeMirror-based DSL editor with autocomplete and inline compile-error feedback; a renderer that turns DSL + compiled tables into the styled cookbook view; a unified `/food/data` management page for ingredients / variants / aliases / prep_states / substitutions; the conversion table schema + admin needed to upgrade `lines-materialisation`'s quantity normalisation beyond identity; and the hero image upload pipeline.

After this epic, a user can author recipes manually, see them rendered as a cookbook, manage the canonical data, and the schema's auto-create flow (`dsl-resolver`/116) has a real editor + curation UI behind it. No ingestion pipeline yet (Epic 02), no review queue (Epic 03), no planning / batches / cook events (Epic 05) — just the management surfaces.

## PRDs

| #   | PRD                                                                   | Summary                                                                                                                   | Status      |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 118 | [Food App Scaffold & Manifest](../prds/app-shell/README.md)           | `pillars/food/app` frontend; module manifest; shell route mounting at `/food`; landing page                               | Done        |
| 119 | [Recipe CRUD Pages](../prds/recipe-crud-pages/README.md)              | `/food/recipes` list, `/food/recipes/:id` detail, `/food/recipes/new`, `/food/recipes/:id/edit`, promote, archive         | Not started |
| 120 | [DSL CodeMirror Editor](../prds/dsl-editor/README.md)                 | CodeMirror 6 + Lezer grammar; autocomplete from slug_registry; compile-error squiggles; chip render for `@N`              | Done        |
| 121 | [DSL Renderer](../prds/dsl-renderer/README.md)                        | Cookbook view: chips for ingredient refs, clickable `@time` timers, `@temperature` widgets, markdown body                 | In progress |
| 122 | [Unified `/food/data` Management Page](../prds/data-page/README.md)   | One page, tabs for ingredients/variants/aliases/prep_states/substitutions; bulk operations; search & filter               | Not started |
| 123 | [Conversion Table Schema & Admin](../prds/conversion-table/README.md) | `unit_conversions` global + `ingredient_weights` per-ingredient; upgrades `lines-materialisation` normalisation; admin UI | Partial     |
| 124 | [Hero Image Upload](../prds/hero-image-upload/README.md)              | `POST /api/food/recipes/:id/hero`; storage under `data/food/recipes/<id>/`; thumbnail generation                          | Partial     |

### Build order

```
118 ──► (120, 121, 122, 123, 124 in parallel) ──► 119
```

- **118** lands first (every other surface mounts under the food module).
- **120** (editor), **121** (renderer), **122** (data page), **123** (conversion table), **124** (hero image) are independent of each other and can be built in parallel.
- **119** depends on **120** (the edit page wraps the editor) and **121** (the detail page uses the renderer). Builds last.
- `conversion-table`'s conversion-table tables also unblock a follow-up to `lines-materialisation` (upgrade compile normalisation beyond identity). That upgrade is a small change to compile, captured as an acceptance criterion in `conversion-table` rather than a new PRD.

## Dependencies

- **Requires:** All of Epic 00 (schema, DSL pipeline, seed). Specifically `recipe-model` service methods (`createRecipe`, `createNewVersion`, `promoteVersion`, `archiveRecipe`, `renameRecipeSlug`) and `lines-materialisation`'s `compileRecipeVersion` are the contract consumed by Epic 01.
- **Requires:** Existing shell module registry (the `shell` pillar's app-switcher) for the food frontend to register and mount.
- **Unlocks:** Epic 02 (ingestion writes drafts that go through the same editor/renderer for human review), Epic 03 (review queue UI sits in the food frontend next to the recipe pages), Epic 05 (planning UI mounts in the food frontend).

## Out of Scope

- Ingestion (URL paste, Instagram, screenshot, text) — Epic 02.
- Draft review queue UI — Epic 03 (lives in `app-food` but is its own surface).
- Lists / shopping — Epic 04 (lives in `app-lists`).
- Meal planning & cook events — Epic 05.
- Substitution graph queries & solver UI — Epic 06.
- Cooking mode (hands-free large-text view with per-step timers) — deferred to a post-Epic-01 PRD. The renderer (`dsl-renderer`) is built to support it; the layout layer ships later.
- Nutritional data display — out of scope for the theme.
- Recipe sharing / multi-user views — single-user system.
