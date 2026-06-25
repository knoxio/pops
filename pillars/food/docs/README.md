# Theme: Food

> Recipes, meal planning, ingredient management, and multimodal recipe ingestion. The end-to-end system for cooking from a personal recipe library.

## Strategic Objective

Build a self-hosted food app that turns scattered recipe sources (websites, Instagram reels, screenshots, free-text ideas) into a unified, queryable recipe library, and makes batch meal prep a tractable weekly habit. Components and plates share one schema (the "chuck → patty → burger" model — see [ADR-022](architecture/adr-022-unified-recipe-ingredient-model.md)). Cook batches with provenance and expiry feed FIFO consumption, expiry warnings, and pantry-aware shopping lists.

The North Star: get the user cooking from their Instagram saved folder within the first month of use.

## Success Criteria

- A recipe from an Instagram reel reaches the user's library in under 2 minutes (URL paste → review → approve)
- A weekly meal plan generates a shopping list that correctly subtracts current pantry batches
- A Sunday batch of "burger patties" is correctly consumed by Tuesday's burger run via FIFO
- The substitution graph answers "out of butter, what works in this savoury recipe?" via `cook-time-substitutions`'s cook-time picker; verified by integration tests that seed at least one substitution edge per context tag declared in `substitution-model` (`savory`, `sweet`, `baking`, `frying`, `dressing`, `marinade`, `garnish`, `vegan`, `dairy-free`, `gluten-free`)
- The system retains original recipe text alongside normalised metric quantities, so a misparsed quantity never silently corrupts the source
- Ingest pipeline processes 100% of recipe-website URLs that expose JSON-LD and ≥80% of Instagram reels (the remainder fall back to manual caption paste)
- Cook-event history feeds visible recipe iteration ("v3 was rated higher than v2")

## PRD Index

PRDs are self-contained (inline acceptance criteria) and grouped by area below.

**Schema & Foundations** — All food SQLite tables, indexes, constraints, invariants, and the recipe-DSL parse/resolve/compile pipeline. The data-and-schema floor every surface stands on; `mise db:init && mise db:seed:food` produces a coherent food database with all invariant and DSL tests passing.

| PRD                                                                   | Summary                                                                                                        | Status      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| [Ingredient & Variant Model](prds/ingredient-model.md)                | Canonical ingredients with hierarchy, variants, prep_states, aliases, `slug_registry` (global namespace)       | Done        |
| [Recipe & Version Schema](prds/recipe-model.md)                       | `recipes`, `recipe_versions`, `recipe_tags`; status enum; hero image; slug registration; compile-state columns | Done        |
| [DSL Grammar & Parser](prds/dsl-parser.md)                            | Formal grammar per [ADR-023](architecture/adr-023-recipe-markdown-dsl.md); text → AST; typed parse errors      | Done        |
| [DSL Resolver](prds/dsl-resolver.md)                                  | AST → ResolvedRecipeAst via `slug_registry`; variant scoping; proposed-slug tracking for unknown refs          | Done        |
| [Recipe Lines & Steps Materialisation](prds/lines-materialisation.md) | `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs` tables; `compileRecipeVersion()` function      | Done        |
| [Recipe Graph Cycle Detection](prds/recipe-cycle-detection.md)        | DFS over the recipe ↔ yield ↔ recipe graph; invariant fires at compile; `RecipeCycleError`                     | Done        |
| [Batch & Cook Event Model](prds/batch-model.md)                       | Batches with provenance and expiry, recipe_runs, batch_consumptions, FIFO consumption helpers                  | Done        |
| [Substitution Model](prds/substitution-model.md)                      | Substitution graph (global + per-recipe), context tags, source-cardinality CHECKs                              | Done        |
| [Ingest Source & Media Layout](prds/ingest-sources.md)                | `ingest_sources` table, `storage/food/ingest/` layout, 100-dir FIFO cap, Litestream exclusion config           | Partial     |
| [Plan Entry Model](prds/plan-entry-model.md)                          | `plan_entries` table; slot enum; ad-hoc vs slotted entries; date range queries                                 | Partial     |
| [Lists Schema](../../lists/docs/prds/schema.md) (lists pillar)        | `lists`, `list_items` — owned by the lists pillar; food is the first consumer via the SDK                      | Done        |
| [Seed Data & Mise Tasks](prds/seed-data.md)                           | `db:seed:food` task, fixture set covering invariants, `db-types` regen, baseline conversions                   | Not started |

**Recipe & Ingredient Management** — The user-facing surfaces over the schema: `app-food` as a shell-registered module, recipe CRUD with versions, a CodeMirror DSL editor with autocomplete and inline compile errors, the cookbook renderer, the unified `/food/data` curation page, the conversion table that upgrades quantity normalisation beyond identity, and hero image upload.

| PRD                                                         | Summary                                                                                                                   | Status      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [Food App Scaffold & Manifest](prds/app-shell.md)           | `pillars/food/app` frontend; module manifest; shell route mounting at `/food`; landing page                               | Done        |
| [Recipe CRUD Pages](prds/recipe-crud-pages.md)              | `/food/recipes` list, `/food/recipes/:id` detail, `/food/recipes/new`, `/food/recipes/:id/edit`, promote, archive         | Not started |
| [DSL CodeMirror Editor](prds/dsl-editor.md)                 | CodeMirror 6 + Lezer grammar; autocomplete from slug_registry; compile-error squiggles; chip render for `@N`              | Done        |
| [DSL Renderer](prds/dsl-renderer.md)                        | Cookbook view: chips for ingredient refs, clickable `@time` timers, `@temperature` widgets, markdown body                 | In progress |
| [Unified `/food/data` Management Page](prds/data-page.md)   | One page, tabs for ingredients/variants/aliases/prep_states/substitutions; bulk operations; search & filter               | Done        |
| [Conversion Table Schema & Admin](prds/conversion-table.md) | `unit_conversions` global + `ingredient_weights` per-ingredient; upgrades `lines-materialisation` normalisation; admin UI | Partial     |
| [Hero Image Upload](prds/hero-image-upload.md)              | `POST /api/food/recipes/:id/hero`; storage under `data/food/recipes/<id>/`; thumbnail generation                          | Done        |

**Ingestion Pipeline** — The end-to-end path that turns a multimodal recipe source (web URL, Instagram reel, screenshot, free text) into a draft `recipe_versions` row ready for review. Covers the ingest API + BullMQ queue contract, the `pops-worker-food` container, per-kind extraction paths, and AI usage logging.

| PRD                                                             | Summary                                                                                               | Status      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| [Ingest API & BullMQ Queue Contract](prds/ingest-api.md)        | `POST /api/food/ingest` endpoint; BullMQ `food.ingest` queue; job shape, retries, backoff; status API | Not started |
| [pops-worker-food Container](prds/worker-container.md)          | Docker image (Node + Python venv + yt-dlp + ffmpeg + faster-whisper); long-running daemon; lifecycle  | Partial     |
| [Web URL — JSON-LD Extraction](prds/web-jsonld.md)              | Fetch HTML, parse `application/ld+json` Recipe schema, map to draft. Fast path, no LLM call.          | Not started |
| [Web URL — LLM Fallback Extraction](prds/web-llm-fallback.md)   | When JSON-LD absent: readability extract → DSL via text LLM. Slower path; one Claude call per ingest. | Not started |
| [Instagram Acquisition](prds/instagram-acquisition.md)          | yt-dlp + cookie management; caption + video + info JSON download; auth-dead detection                 | Not started |
| [Instagram STT + Vision Pipeline](prds/instagram-stt-vision.md) | Caption heuristic; conditional faster-whisper STT; ffmpeg scene-detect keyframes; Claude vision → DSL | Not started |
| [Screenshot Ingest](prds/screenshot-ingest.md)                  | Single image → Claude vision → DSL extraction                                                         | Not started |
| [Text Ingest](prds/text-ingest.md)                              | Free-text paste → Claude text → DSL extraction                                                        | Not started |
| [AI Usage Logging & Prompt Viewer](prds/ai-usage-prompts.md)    | Log every LLM call to `ai_inference_log`; read-only prompt viewer at `/food/prompts`                  | Not started |

**Draft Review & Approval** — The review surface that consumes ingest output: an `/food/inbox` triage queue, a per-draft inspector pairing the DSL editor with an ingest-provenance pane, approve/reject mutations, Rejected and Failed tabs, and a deterministic review-quality heuristic that sorts visibly-clean drafts to the top.

| PRD                                                        | Summary                                                                                                        | Status      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| [Review Queue Page](prds/review-queue-page.md)             | `/food/inbox` with Drafts / Rejected / Failed tabs; heuristic-sorted rows; filter chips; cursor pagination     | Not started |
| [Per-Draft Inspector](prds/draft-inspector.md)             | `/food/inbox/:sourceId` three-pane view: provenance + DSL editor + approve/reject controls; auto-create banner | Not started |
| [Approval & Rejection Flow](prds/approve-reject-flow.md)   | Server mutations (`approve` / `reject` / `unreject`); new `recipe_version_rejections` table; FK transitions    | Done        |
| [Review Quality Heuristic](prds/quality-heuristic.md)      | Deterministic scoring function over compile_status + proposedSlugs + partialReason + kind + age; four bands    | Not started |
| [Rejected & Failed Tabs](prds/rejected-and-failed-tabs.md) | Rejected tab with undo; Failed-ingest tab wired to `ingest-api` `retry`; reject-reason capture + filter        | Partial     |

**Lists & Shopping** — The generic lists/list_items model lives in the [lists pillar](../../lists/docs/README.md); the food-owned deliverable is the recipe → shopping-list "Send" action that aggregates recipe-line quantities through the conversion tables and pushes them into a lists-pillar shopping list over the SDK. The list is flat — store-section grouping and pantry subtraction arrive in Pantry-Aware Shopping.

| PRD                                                | Summary                                                                                                              | Status |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| [Recipe Send-to-List Action](prds/send-to-list.md) | Food → shopping list: Send button on `dsl-renderer` renderer; picker modal; unit-conversion aggregation; scale-aware | Done   |

**Meal Planning & Batches** — The surfaces that turn `plan_entries` and `batches` / `recipe_runs` / `batch_consumptions` into a working meal-prep loop: a week-grid planning page, a "Mark cooked" / "Cook now" modal that runs FIFO consumption and yields a batch, a fridge inventory view with location grouping and expiry sort, and per-batch edit affordances.

| PRD                                                            | Summary                                                                                                                   | Status      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [Planning Page & Plan Entries API](prds/planning-page.md)      | `/food/plan` week-grid + day-swiper mobile; plan_entries CRUD; drag-drop reschedule; custom-slot CRUD                     | Not started |
| [Cook Event Recording](prds/cook-event-recording.md)           | Single "Mark cooked" modal (from plan entry) + "Cook now" (from recipe detail); transactional cook mutation               | Not started |
| [Batch Lifecycle](prds/batch-lifecycle.md)                     | Batch creation services consumed by `cook-event-recording`; manual batch entry; relocate; expiry override; batch deletion | Not started |
| [FIFO Consumption UI Integration](prds/fifo-consumption-ui.md) | Consume-preview + shortfall surfacing in cook modal; batch-override mode; "consumed externally" fallback                  | Not started |
| [Fridge Inventory View](prds/fridge-view.md)                   | `/food/fridge` browse-all-batches page; location grouping; expiry sort; filters; per-batch edit row actions               | Not started |

**Substitutions & Solver** — The substitution graph layered onto cooking and discovery surfaces: a read-only visual graph explorer that complements the flat-tab CRUD in `/food/data`, cook-time substitution suggestions inlined into the batch-override picker, and a "what can I cook tonight?" solver that ranks cookable recipes against the current fridge plus the graph. Read-only against the graph; CRUD stays in `/food/data`.

| PRD                                                                   | Summary                                                                                                                                   | Status      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [Substitution Graph Explorer](prds/substitution-graph-explorer.md)    | `/food/data/substitutions/graph` — visual node-edge view; click a node → see all incoming/outgoing subs                                   | Partial     |
| [Cook-Time Substitution Suggestions](prds/cook-time-substitutions.md) | `fifo-consumption-ui` amendment — batch-override picker splits into Same-variant / Substitutions sections; ranks by ratio fit + expiry    | Not started |
| [What-Can-I-Cook Solver](prds/cook-solver.md)                         | `/food/solve` page; deterministic cookable+ranking; consumes `substitution-model` graph + `batch-model` batches; fridge-view entry button | Not started |

**Pantry-Aware Shopping** — The store-section taxonomy plus a plan-derived shopping list that subtracts current pantry batches from the upcoming plan's requirements. A new `ingredient_tags` table with `store-section:<value>` namespaced tags, and a `/food/shopping/from-plan` page that walks the plan's recipes, computes needs, subtracts batches, and creates a section-sorted shopping list. Closes the theme's value loop: ingest → recipes → plan → cook → fridge → solver → plan-derived shopping.

| PRD                                                                     | Summary                                                                                                             | Status      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| [Store-Section Taxonomy](prds/store-section-taxonomy.md)                | `ingredient_tags(ingredient_id, tag)` many-to-many; `store-section:*` namespaced tags; CRUD addition to `data-page` | Done        |
| [Plan-Derived Shopping List Generator](prds/plan-shopping-generator.md) | `/food/shopping/from-plan` + plan-grid button; strict pantry subtraction; section-sorted output                     | Not started |

## Key Decisions

| Decision               | Choice                                                                                                  | Rationale                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component model        | Unified — every recipe yields an ingredient; components and plates share one schema                     | See [ADR-022](architecture/adr-022-unified-recipe-ingredient-model.md). One query path whether output is homemade or purchased                                         |
| Ingredient model       | Three-axis: hierarchical canonical ingredient → variant → orthogonal prep_state                         | Roma is a tomato; canned and fresh are variants; dicing is a modifier, not a separate ingredient                                                                       |
| Recipe edit model      | Full revision history (`recipe_versions`); cook events FK to a specific version                         | Storage = O(edits × recipe + cooks × FK), cheaper than snapshot-per-cook, and preserves "what version did I actually cook"                                             |
| Recipe storage format  | Custom markdown DSL with `@func(...)` calls (`.recipe` file extension as a convention)                  | See [ADR-023](architecture/adr-023-recipe-markdown-dsl.md). One canonical store; structural refs unlock cooking-mode UI; LLM-friendly for ingest                       |
| Slug namespace         | Global `slug_registry` for ingredients + recipes + prep_states; variants scoped under parent ingredient | DSL refs (`@banana`, `@smash-patty`) must be unambiguous; tags excluded (free-form, high-churn)                                                                        |
| Substitutions          | Global graph + per-recipe overrides + context tags                                                      | Powers "out of X, use Y" at cook time and "what can I cook tonight" at plan time                                                                                       |
| Batch tracking         | Full identity — every made/purchased qty is a row with source, location, expiry; FIFO consumption       | Required for meal-prep expiry warnings and provenance back to cook events                                                                                              |
| Quantity normalisation | Store original text + canonical metric side-by-side on every recipe line                                | Display preserves source faithfully; aggregation uses metric                                                                                                           |
| Ingest review          | Always draft → user approves before joining the canonical library                                       | Mirrors finance-imports rule-promotion pattern; LLM hallucinations don't leak                                                                                          |
| Ingestion runtime      | BullMQ queue in the food pillar; `pops-worker-food` Docker image runs yt-dlp + ffmpeg + faster-whisper  | Keeps Python/STT/ffmpeg out of the API image; same compose stack and Redis                                                                                             |
| STT + vision           | CPU `faster-whisper` (distil-large-v3) for transcripts; Claude vision API for keyframe OCR              | Self-host the cheap part; pay for the part that matters (recipe text overlays)                                                                                         |
| Source media retention | Keep video + keyframes + transcript for 100 most-recent ingests (~5 GB FIFO); excluded from Litestream  | Regenerable, not personal data of record                                                                                                                               |
| Lists app              | Separate `lists` pillar (generic), food is first consumer                                               | Cross-domain unlock — travel packing lists, todo lists later                                                                                                           |
| Doc protocol           | PRDs carry acceptance criteria inline; no per-PRD user stories                                          | Theme-local exception to `docs/CLAUDE.md` Ticket Rule; PRDs are split more granularly to compensate. See [ADR-025](architecture/adr-025-theme-07-food-doc-protocol.md) |
| Substitution traversal | Single-hop only — never auto-resolves transitive chains                                                 | See [ADR-024](architecture/adr-024-substitution-single-hop.md). Bounded query cost; predictable UX; users curate direct edges                                          |

## Risks

- **Instagram cookie fragility** — Throwaway-account cookies expire and get challenged. Mitigation: documented refresh runbook (`instagram-acquisition`), worker detects auth failures and surfaces them to the review queue, graceful fallback to manual caption paste.
- **Claude vision cost drift** — Per-ingest cost could climb. Mitigation: hard caps (≤5 keyframes, ≤1 vision call per ingest); usage logged to existing `ai_inference_log`; monthly budget alert via AI ops.
- **Unit conversion accuracy** — "1 medium onion = 150 g" is approximate. Mitigation: original text always stored alongside metric; per-ingredient density overrides; conversion is best-effort, not authoritative.
- **Tag taxonomy drift** — LLM-proposed tags fragment ("vegan" vs "plant-based"). Mitigation: tag-merge UI (deferred PRD), canonical aliasing same as ingredient aliases.
- **Cycle introduction via unified model** — Recipe A can in principle take Recipe A's output as input. Mitigation: cycle detection at compile time per `recipe-cycle-detection` (iterative DFS), invoked between resolver (`dsl-resolver`) and materialiser (`lines-materialisation`). Self-reference caught earlier in `dsl-resolver`'s resolver.
- **Single-point STT dependency** — `faster-whisper` Python service must be alive in the worker. Mitigation: degraded mode = caption-only ingest; worker reports STT health to admin UI.

## Out of Scope

- Nutrition data (calories, macros)
- Recipe sharing / multi-user
- iOS app and iOS Share Sheet implementation (the ingest endpoint will accept Share Sheet payloads; the native app is blocked elsewhere)
- Wall-tablet "cooking mode" view (the renderer is built to support it; the layout layer ships later)
- Voice input
- Cross-domain integrations (finance grocery matching, cerebrum indexing, inventory kitchen-gear linking) — separate themes after the food app stabilises
- Notifications (none in v1)
