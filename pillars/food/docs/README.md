# Theme: Food

> Recipes, meal planning, ingredient management, and multimodal recipe ingestion. The end-to-end system for cooking from a personal recipe library.

## Strategic Objective

Build a self-hosted food app that turns scattered recipe sources (websites, Instagram reels, screenshots, free-text ideas) into a unified, queryable recipe library, and makes batch meal prep a tractable weekly habit. Components and plates share one schema (the "chuck → patty → burger" model — see [ADR-022](architecture/adr-022-unified-recipe-ingredient-model.md)). Cook batches with provenance and expiry feed FIFO consumption, expiry warnings, and pantry-aware shopping lists.

The North Star: get the user cooking from their Instagram saved folder within the first month of use.

## Success Criteria

- A recipe from an Instagram reel reaches the user's library in under 2 minutes (URL paste → review → approve)
- A weekly meal plan generates a shopping list that correctly subtracts current pantry batches
- A Sunday batch of "burger patties" is correctly consumed by Tuesday's burger run via FIFO
- The substitution graph answers "out of butter, what works in this savoury recipe?" via PRD-149's cook-time picker; verified by integration tests that seed at least one substitution edge per context tag declared in PRD-109 (`savory`, `sweet`, `baking`, `frying`, `dressing`, `marinade`, `garnish`, `vegan`, `dairy-free`, `gluten-free`)
- The system retains original recipe text alongside normalised metric quantities, so a misparsed quantity never silently corrupts the source
- Ingest pipeline processes 100% of recipe-website URLs that expose JSON-LD and ≥80% of Instagram reels (the remainder fall back to manual caption paste)
- Cook-event history feeds visible recipe iteration ("v3 was rated higher than v2")

## Epics

| #   | Epic                                                                       | Summary                                                                                             | Status      |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| 00  | [Schema & Foundations](epics/00-schema-and-foundations.md)                 | All food schemas with invariants enforced; `mise db:seed:food` produces a coherent fixture database | In progress |
| 01  | [Recipe & Ingredient Management](epics/01-recipe-ingredient-management.md) | `app-food` scaffold, recipe CRUD with versions, ingredient/variant/alias management UI              | Not started |
| 02  | [Ingestion Pipeline](epics/02-ingestion-pipeline.md)                       | BullMQ queue, `pops-worker-food` container, web/Instagram/screenshot/text ingestion to drafts       | Not started |
| 03  | [Draft Review & Approval](epics/03-draft-review.md)                        | Review queue UI, ingredient resolution, tag confirmation, promotion to current version              | Not started |
| 04  | [Lists & Shopping](epics/04-lists-and-shopping.md)                         | `app-lists` scaffold (generic), food → shopping integration                                         | Not started |
| 05  | [Meal Planning & Batches](epics/05-meal-planning.md)                       | Plan entries, cook events, batch creation with expiry, FIFO consumption, fridge view                | In progress |
| 06  | [Substitutions & Solver](epics/06-substitutions.md)                        | Substitution graph, cook-time recommendations, "what can I cook tonight" solver                     | Not started |
| 07  | [Pantry-Aware Shopping](epics/07-pantry-aware-shopping.md)                 | Plan-derived shopping list with pantry subtraction and store-section grouping                       | Not started |

Epic 00 blocks 01–07. Epics 01 and 02 can proceed in parallel once schema lands. Epic 03 depends on both 01 and 02. Epics 04, 05, 06, 07 are sequential downstream slices on top of 01–03.

## Key Decisions

| Decision               | Choice                                                                                                  | Rationale                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component model        | Unified — every recipe yields an ingredient; components and plates share one schema                     | See [ADR-022](architecture/adr-022-unified-recipe-ingredient-model.md). One query path whether output is homemade or purchased                                         |
| Ingredient model       | Three-axis: hierarchical canonical ingredient → variant → orthogonal prep_state                         | Roma is a tomato; canned and fresh are variants; dicing is a modifier, not a separate ingredient                                                                             |
| Recipe edit model      | Full revision history (`recipe_versions`); cook events FK to a specific version                         | Storage = O(edits × recipe + cooks × FK), cheaper than snapshot-per-cook, and preserves "what version did I actually cook"                                                   |
| Recipe storage format  | Custom markdown DSL with `@func(...)` calls (`.recipe` file extension as a convention)                  | See [ADR-023](architecture/adr-023-recipe-markdown-dsl.md). One canonical store; structural refs unlock cooking-mode UI; LLM-friendly for ingest                       |
| Slug namespace         | Global `slug_registry` for ingredients + recipes + prep_states; variants scoped under parent ingredient | DSL refs (`@banana`, `@smash-patty`) must be unambiguous; tags excluded (free-form, high-churn)                                                                              |
| Substitutions          | Global graph + per-recipe overrides + context tags                                                      | Powers "out of X, use Y" at cook time and "what can I cook tonight" at plan time                                                                                             |
| Batch tracking         | Full identity — every made/purchased qty is a row with source, location, expiry; FIFO consumption       | Required for meal-prep expiry warnings and provenance back to cook events                                                                                                    |
| Quantity normalisation | Store original text + canonical metric side-by-side on every recipe line                                | Display preserves source faithfully; aggregation uses metric                                                                                                                 |
| Ingest review          | Always draft → user approves before joining the canonical library                                       | Mirrors finance-imports rule-promotion pattern; LLM hallucinations don't leak                                                                                                |
| Ingestion runtime      | BullMQ queue in `pops-api`; new `pops-worker-food` Docker image runs yt-dlp + ffmpeg + faster-whisper   | Keeps Python/STT/ffmpeg out of the API image; same compose stack and Redis                                                                                                   |
| STT + vision           | CPU `faster-whisper` (distil-large-v3) for transcripts; Claude vision API for keyframe OCR              | Self-host the cheap part; pay for the part that matters (recipe text overlays)                                                                                               |
| Source media retention | Keep video + keyframes + transcript for 100 most-recent ingests (~5 GB FIFO); excluded from Litestream  | Regenerable, not personal data of record                                                                                                                                     |
| Lists app              | Separate `packages/app-lists` (generic), food is first consumer                                         | Cross-domain unlock — travel packing lists, todo lists later                                                                                                                 |
| Doc protocol           | PRDs carry acceptance criteria inline; no per-PRD user stories                                          | Theme-local exception to `docs/CLAUDE.md` Ticket Rule; PRDs are split more granularly to compensate. See [ADR-025](architecture/adr-025-theme-07-food-doc-protocol.md) |
| Substitution traversal | Single-hop only — never auto-resolves transitive chains                                                 | See [ADR-024](architecture/adr-024-substitution-single-hop.md). Bounded query cost; predictable UX; users curate direct edges                                          |

## Risks

- **Instagram cookie fragility** — Throwaway-account cookies expire and get challenged. Mitigation: documented refresh runbook (Epic 02), worker detects auth failures and surfaces them to the review queue, graceful fallback to manual caption paste.
- **Claude vision cost drift** — Per-ingest cost could climb. Mitigation: hard caps (≤5 keyframes, ≤1 vision call per ingest); usage logged to existing `ai_inference_log`; monthly budget alert via AI ops.
- **Unit conversion accuracy** — "1 medium onion = 150 g" is approximate. Mitigation: original text always stored alongside metric; per-ingredient density overrides; conversion is best-effort, not authoritative.
- **Tag taxonomy drift** — LLM-proposed tags fragment ("vegan" vs "plant-based"). Mitigation: tag-merge UI (deferred PRD), canonical aliasing same as ingredient aliases.
- **Cycle introduction via unified model** — Recipe A can in principle take Recipe A's output as input. Mitigation: cycle detection at compile time per PRD-117 (iterative DFS), invoked between resolver (PRD-115) and materialiser (PRD-116). Self-reference caught earlier in PRD-115's resolver.
- **Single-point STT dependency** — `faster-whisper` Python service must be alive in the worker. Mitigation: degraded mode = caption-only ingest; worker reports STT health to admin UI.

## Out of Scope

- Nutrition data (calories, macros)
- Recipe sharing / multi-user
- iOS app and iOS Share Sheet implementation (the ingest endpoint will accept Share Sheet payloads; the native app is blocked elsewhere)
- Wall-tablet "cooking mode" view (revisited post-Epic 01)
- Voice input
- Cross-domain integrations (finance grocery matching, cerebrum indexing, inventory kitchen-gear linking) — separate themes after the food app stabilises
- Notifications (none in v1)
