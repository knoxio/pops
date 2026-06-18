# Spike — `app-food`: recipes, components, meal prep, ingestion

Investigation only — recommendations, no code changes. Captures decisions reached in scoping; intended as the starting point for the PRD set now living under `pillars/food/docs/`.

Roadmap context: `docs/roadmap.md` lists "Recipe Book" at priority 8 ("long-term feature, lower daily urgency"). This spike treats it as the next major app after the current Phase 2 work, on the basis that meal prep is a high-frequency daily-life pain point and the data model unlocks downstream cross-domain value (finance ↔ grocery spend, inventory ↔ kitchen gear, cerebrum ↔ "what should I cook tonight").

Vision alignment: vision.md calls out "meal suggestions from what's in stock" as a proactive example. This spike's pantry/batches + substitution graph is the mechanism for that surface.

## Question

Build a self-hosted recipe + meal-prep app that:

1. Treats every recipe output as an ingredient (chuck → patty → burger). Components and plates share one schema.
2. Models ingredients hierarchically with variants and prep states, plus a substitution graph.
3. Ingests recipes from web URLs, Instagram reels, screenshots, and free text — with a draft → user-approval pipeline.
4. Tracks batches (homemade or purchased) with expiry, FIFO consumption, and provenance back to cook events.
5. Plans meals via the **Lego method** — batch-cook components, assemble into plates across the week.
6. Outputs a shopping list to a separate generic `app-lists` module (Todoist-style, food is the first consumer).

## Scoping decisions (already made)

| Topic                | Decision                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| MVP scope            | Full: recipes + ingredients + meal prep + shopping list. Pantry is a stretch goal but designed in.          |
| Package              | New `packages/app-food`. New scaffold `packages/app-lists` (only shopping uses it at launch).               |
| Ingestion priority   | Web URLs + Instagram first. Free text second. iOS Share Sheet PRD'd but not implemented (no iOS app yet).   |
| Ingestion runtime    | BullMQ queue in `pops-api`; new `pops-worker-food` container consumes (yt-dlp, ffmpeg, faster-whisper).     |
| Ingredient model     | Three-axis: `ingredient` (hierarchical) → `variant` → `prep_state` (orthogonal modifier on recipe line).    |
| Components           | Unified: a component is a recipe whose output is an ingredient. Used as input to other recipes.             |
| Meal prep            | Lego method. Components → batches → plates. Plan supports weekly slots, prep sessions, and ad-hoc views.    |
| Shopping list        | Lives in `app-lists`. Food exposes "send to shopping list" actions.                                         |
| Substitutions        | Global graph + per-recipe overrides + context tags. Powers "what can I cook given pantry + subs" queries.   |
| Batches              | Full batch identity: every made/purchased qty is a row with source, location, expiry. FIFO consumption.     |
| Ingest review        | Always draft → user approves. LLM proposes tags + recipe_type; user confirms during promotion.              |
| Instagram auth       | Throwaway IG account + exported cookies in worker. Document refresh procedure.                              |
| STT / vision compute | CPU `faster-whisper` (distil-large-v3) + Claude vision API for keyframe OCR. Logged via existing AI usage.  |
| Source media         | Keep video + keyframes + transcript for 100 most-recent ingests (~5GB cap, FIFO). Excluded from Litestream. |
| Cook history         | Full `recipe_runs` table per cook: scaling, batches produced/consumed, rating, notes.                       |
| Recipe edit model    | Full revision history (`recipe_versions`). Cook events reference a specific version.                        |
| Units                | Store original ("1 cup flour") AND canonical metric (125g) side-by-side on every recipe line.               |
| Notifications        | None in v1.                                                                                                 |
| Tagging              | LLM proposes tags + recipe_type; user approves in review queue. Tag vocabulary grows organically.           |

## Module placement

```
packages/
  app-food/          recipes, ingredients, variants, batches, plan, cook events, ingestion API
  app-lists/         generic lists module (shopping is first consumer)
apps/
  pops-api/
    src/modules/food/       routers, services, queue producers
    src/modules/lists/      lists CRUD
    src/queues/food.ts      BullMQ definitions for food.ingest
  pops-worker-food/  new Docker image: yt-dlp + ffmpeg + Python (faster-whisper) + a thin Node worker
                     consumes food.ingest jobs, writes back via internal API
```

`pops-worker-food` is a separate image so yt-dlp, ffmpeg, and the Python STT stack stay out of the main API image. Same compose stack, same Redis. The worker is stateless; it writes through `pops-api` rather than touching SQLite directly. New entries in [`modular-apps-spike.md`](../../../../docs/ideas/modular-apps-spike.md) module table: `food` and `lists` as page-routed modules.

## Data model (SQLite, normative for the schema PRD)

```text
-- canonical ingredient tree (parent_id is nullable; roma -> tomato -> nightshade if you want depth)
ingredients
  id, parent_id (FK->ingredients.id, nullable), name, slug,
  default_unit (g|ml|count), density_g_per_ml (nullable), notes, created_at

-- "fresh cob corn", "canned corn brine", "frozen kernels"
ingredient_variants
  id, ingredient_id, name, slug, default_unit, package_size_g (nullable), notes, created_at

-- "spring onion" -> scallion ingredient_id; "passata" -> passata variant
ingredient_aliases
  id, ingredient_id (nullable), variant_id (nullable), alias, source (user|llm|ingest)
  CHECK exactly one of ingredient_id / variant_id is set

-- orthogonal modifier on recipe lines (diced, sliced, shredded, julienned, ...)
prep_states
  id, name, slug

-- graph edges; scope=global rows are universal, scope=recipe rows override for one recipe
substitutions
  id,
  from_ingredient_id (nullable), from_variant_id (nullable),
  to_ingredient_id   (nullable), to_variant_id   (nullable),
  ratio REAL DEFAULT 1.0, bidirectional INTEGER DEFAULT 0,
  context_tags JSON,                  -- e.g. ["savory","baking"]
  scope TEXT DEFAULT 'global',        -- 'global' | 'recipe'
  recipe_id (nullable, FK)
  CHECK exactly-one-from / exactly-one-to

-- stable identity; mutable content lives in versions
recipes
  id, slug,
  recipe_type TEXT,                   -- soft enum: component|plate|technique|sauce|drink|condiment|dressing|...
  current_version_id (FK -> recipe_versions.id, nullable),
  archived_at, created_at

-- full content snapshot per edit; cook events FK here
recipe_versions
  id, recipe_id, version_no, title, summary, instructions_md,
  yield_qty REAL, yield_unit, yield_ingredient_id (FK), yield_variant_id (FK, nullable),
  servings INTEGER, prep_minutes INTEGER, cook_minutes INTEGER,
  source_id (FK -> ingest_sources, nullable),
  draft INTEGER DEFAULT 1,
  created_at

recipe_lines
  id, recipe_version_id, position,
  ingredient_id (FK), variant_id (FK, nullable),
  prep_state_id (FK, nullable), optional INTEGER DEFAULT 0,
  original_text TEXT,                 -- "1 cup diced yellow onion"
  original_qty REAL, original_unit TEXT,
  qty_g REAL, qty_ml REAL, qty_count REAL, canonical_unit TEXT,
  notes

recipe_tags
  recipe_id, tag, PRIMARY KEY (recipe_id, tag)

-- "the Sunday pot of patties" or "1 can Mutti tomatoes from Coles"
batches
  id, variant_id (FK), qty_remaining REAL, unit,
  source_type TEXT,                   -- purchase|recipe_run|gift|other
  source_id (nullable, polymorphic by source_type),
  location TEXT,                      -- pantry|fridge|freezer|other
  produced_at, expires_at, notes, created_at

recipe_runs
  id, recipe_version_id, planned_for, started_at, completed_at,
  scale_factor REAL DEFAULT 1.0,
  yielded_batch_id (FK -> batches.id, nullable),
  rating INTEGER (1-5, nullable), notes,
  created_at

batch_consumptions
  id, recipe_run_id, batch_id, qty_consumed REAL, unit

plan_entries
  id, date, slot TEXT,                -- breakfast|lunch|dinner|snack|prep-session
  recipe_id (FK), recipe_version_id (FK, nullable, defaults to current),
  planned_servings INTEGER, notes, created_at

ingest_sources
  id, kind TEXT,                      -- url-web|url-instagram|text|screenshot
  url, caption, transcript_path, keyframes_dir, video_path,
  extracted_json JSON, extractor_version TEXT,
  draft_recipe_id (FK), ingested_at

-- in app-lists
lists
  id, name, kind TEXT,                -- shopping|packing|todo|generic
  owner_app TEXT,                     -- 'food'|'travel'|'user' etc
  created_at

list_items
  id, list_id, label,
  qty REAL, unit,
  ref_kind TEXT,                      -- 'ingredient'|'variant'|'recipe'|'free'
  ref_id (nullable),
  checked INTEGER DEFAULT 0, position INTEGER, due_at, notes
```

### Invariants the schema PRD must enforce

1. **Cycle detection** on `recipe_lines` insert/update. A recursive CTE walks `recipe_version → recipe_lines.ingredient → recipes where yield_ingredient_id = X → recipe_lines`. Reject if it reaches the starting recipe. Required because the unified model permits self-reference by construction.
2. **Source-cardinality CHECKs** on `ingredient_aliases` (exactly one of ingredient_id / variant_id) and `substitutions` (exactly one from-side, exactly one to-side).
3. **`recipes.current_version_id` always points at a non-draft version** once the recipe has been approved at least once. Drafts may exist without a current version.
4. **Batches deplete monotonically.** `qty_remaining` never increases via `batch_consumptions`; new stock = new batches row, not a top-up.
5. **`recipe_runs.yielded_batch_id` is set iff the recipe is a component** (output ingredient exists and yield_qty > 0).

## Ingestion pipeline

```text
POST /api/food/ingest { kind, payload }    -- pops-api endpoint
   |
   v enqueue food.ingest in BullMQ
   |
pops-worker-food picks up:
   |
   +-- kind=url-web --------------------------------------------------+
   |     fetch HTML                                                    |
   |     parse <script type="application/ld+json"> Recipe schema       |
   |     if JSON-LD present: structured input, skip LLM extraction     |
   |     else: extract main text via readability, send to text LLM     |
   +-------------------------------------------------------------------+
   |
   +-- kind=url-instagram --------------------------------------------+
   |     yt-dlp --cookies <throwaway> --write-info-json --write-thumb  |
   |       -> video.mp4, caption (info.json.description), thumbnail    |
   |                                                                    |
   |     caption_heuristic(caption):                                    |
   |       structured if: bullets / numbers / "ingredients:" / >200ch  |
   |                                                                    |
   |     if structured: skip STT (caption is the recipe)                |
   |     else: faster-whisper (distil-large-v3, CPU) -> transcript.vtt  |
   |                                                                    |
   |     ffmpeg scene-change detect -> 5-10 keyframes (jpg)             |
   |                                                                    |
   |     Claude vision API:                                             |
   |       inputs: keyframes (image), caption (text), transcript (text)|
   |       prompt: extract a recipe per fixed JSON schema               |
   |     -> structured JSON                                             |
   +-------------------------------------------------------------------+
   |
   +-- kind=screenshot -----------------------------------------------+
   |     Claude vision API on the uploaded image                       |
   +-------------------------------------------------------------------+
   |
   +-- kind=text -----------------------------------------------------+
   |     DeepSeek (or Claude text) -> JSON                             |
   +-------------------------------------------------------------------+
   |
   v
Validate extracted_json against strict JSON Schema
   { title, summary, recipe_type?, tags?[],
     yield: { qty, unit, ingredient_name? },
     servings?, prep_minutes?, cook_minutes?,
     ingredients: [{ original, qty?, unit?, ingredient_name, variant?, prep?, optional?, notes? }],
     instructions: [string],
     confidence: number 0..1 }
   |
   v
Resolve names -> existing ingredient_id / variant_id
   - exact slug match
   - alias table lookup
   - fuzzy match (LLM-assisted) for misses; emit "proposed_new_ingredient" entries
   |
   v
Insert recipe + recipe_version (draft=1) + recipe_lines.
Write ingest_sources row with full media paths + extracted_json + extractor_version.
Move source media into storage/food/ingest/<source_id>/.
Trim storage/food/ingest/ to 100 most-recent dirs by mtime.
   |
   v
Surface in pops-shell review queue:
   - confirm/edit each recipe line (ingredient resolution, qty, unit, prep)
   - approve/edit proposed novel ingredients & variants
   - confirm proposed tags + recipe_type
   - approve -> draft=0, set recipes.current_version_id
```

### AI usage accounting

Every Claude vision call and every text-LLM extraction call must log to `ai_usage` / `ai_inference_log` using the existing AI ops infrastructure (`packages/app-ai`). One call per ingest is the budget. Worker exposes ingestion model + token counts back through the API write-path.

### Storage layout for source media

```
storage/food/ingest/<source_id>/
  video.mp4            (Instagram only)
  caption.txt
  transcript.vtt       (only if STT ran)
  keyframes/000.jpg    (5-10 files)
  extracted.json       (the LLM output that became the draft)
  meta.json            (extractor_version, timings, costs)
```

Cap: 100 directories, FIFO eviction by directory mtime. Excluded from the Litestream replication config (this is regenerable / not personal data of record). Backup policy doc must be updated.

## Meal-prep model (the Lego method)

Components and plates are both rows in `recipes`, distinguished only by `recipe_type` and by whether they have a `yield_ingredient_id` that is referenced as input by other recipes. The same `plan_entries` table accommodates three planning models simultaneously:

1. **Weekly slots** — fill `breakfast|lunch|dinner|snack` per day.
2. **Prep sessions** — slot=`prep-session`, recipes are components, produce batches.
3. **Ad-hoc this-week list** — flat entries, no slot constraint.

Worked example:

```
plan_entries (Sun 2026-06-14 prep-session):
  - "smash patties"      (component, yields "burger patty"     x12)
  - "tomato salsa"       (component, yields "tomato salsa"      500ml)
  - "homemade chips"     (component, yields "homemade chips"    x4 portions)

executing -> recipe_runs (3) -> batches (3, location=fridge|freezer, expires_at populated)

plan_entries (Tue 2026-06-16 dinner):
  - "AU the lot burger"  (plate, recipe_lines reference "burger patty", "tomato salsa", ...)

executing -> recipe_run -> batch_consumptions (FIFO by expires_at)
   -> updates qty_remaining on consumed batches
```

The UI presents three views over the same `plan_entries` rows; the data model is unified.

## Shopping list flow

```
plan-derived (button on food/plan page):
   - sum recipe_lines across plan_entries in date range
   - subtract from sums where matching variant has batches.qty_remaining > 0  [pantry stretch]
   - group by ingredient.tag = 'store-section:produce' / 'store-section:dairy' / ...
   - POST to /api/lists/:id/items as list_items with ref_kind='ingredient'|'variant'

manual (in lists app):
   - add free-text or pick ingredient/variant via search

recipe-derived (button on recipe page):
   - "add this recipe's ingredients to shopping list"

assembly cooking (from a plate, when batches are short):
   - "add missing inputs to shopping list" — diffs required vs available batches
```

`app-lists` exposes a thin internal API (`POST /api/lists/:id/items`, `PATCH /api/lists/:id/items/:item_id`). Food calls it. No domain coupling beyond the FK conventions.

## Substitution usage

Two query surfaces drive UI:

1. **At cook time** — recipe view shows "out of X? Try: Y (ratio 0.75, tag: savory)". Walks `substitutions` filtered by recipe context tags.
2. **At plan time** — "what can I cook tonight given current batches?" Solver: for each candidate recipe, can all `recipe_lines` be satisfied by `batches` directly OR by walking one substitution edge? Cheap in SQL with a recursive CTE and a single user's dataset.

The graph also enables "I have a glut of zucchini, what recipes use it OR have it as a sub?".

## Cross-domain integration (future, not v1)

- **Finance** — match grocery-line-items from transaction imports to canonical ingredients (long-tail of fuzzy matching; lean on the existing ingest pattern). Answers "how much did I spend on tomatoes this year".
- **Inventory** — kitchen gear tied to recipes ("requires stand mixer"). Recipe filter "what can I make with what I own".
- **Cerebrum** — recipes and cook events are an embeddable source per [PRD 079](../../../../docs/themes/06-cerebrum/prds/079-engram-indexing/us-04-cross-source-index.md). Surfaces "what should I cook tonight" suggestions from engrams about preferences, mood, weather.
- **Travel** — destination cuisine research; saved recipes tagged by trip.

## Risks and open spec items

1. **Instagram auth fragility.** Throwaway cookies expire and get challenged. Need: (a) documented refresh procedure, (b) worker-side detector that surfaces "auth dead" alerts to the review queue, (c) graceful fallback to "paste the caption manually" when extraction fails.
2. **Claude vision cost.** Bound per ingest: ≤5 keyframes, ≤1 vision call. Track in AI usage; alert if monthly cost exceeds a configurable cap. Estimate: at current pricing, 100 ingests/month with vision ≈ low single-digit dollars.
3. **Unit conversion accuracy.** Cup→ml is exact; "1 medium onion = 150g" is approximate. Seed a curated conversion table; allow per-ingredient overrides via `ingredients.density_g_per_ml` and a `typical_weights` join table. Storing `original_*` alongside `qty_g` means display-correctness is preserved even when normalization is fuzzy.
4. **Tag taxonomy drift.** LLM-proposed tags will fragment ("vegan" vs "plant-based"). Need a periodic curation UI (merge-tags) or a canonical tag list with proposed-tag aliasing. PRD this explicitly; it's the same shape as the ingredient-aliases problem.
5. **Cycle detection.** Required at insert. Don't forget it.
6. **`recipe_type` boundary.** Soft enum, UX-only. Don't enforce structural rules off it. Spec the heuristic explicitly: "recipe if (a) output ever stored as a batch, (b) heat/fermentation applied, OR (c) >1 input"; "prep_state if a single-step knife transformation done in the moment".
7. **Multi-language ingest.** Portuguese/Spanish reels: Claude vision handles fine in-prompt; STT (faster-whisper) is multilingual. Verify with sample inputs early. May need a normalisation step that translates ingredient names to canonical English (or vice versa — decide).
8. **iOS Share Sheet** is PRD'd but blocked on the (not-yet-existing) iOS app. Web paste-URL covers MVP.

## Suggested build order

Each step is a shippable slice; later steps assume earlier ones.

1. **Schema + migrations + seed.** Tables above, `mise db:seed:food`, fixture data for ~20 ingredients across 3 variants each.
2. **Recipe CRUD + versions** (manual entry, no ingestion). Shell pages: list, detail, edit-as-new-version. Cycle detection enforced.
3. **Ingredient/variant/alias management UI.** Required by the review queue.
4. **Web URL ingestion** (JSON-LD path only). No auth, no STT, no vision. End-to-end proves the queue and review flow.
5. **Draft → approve review queue UI.** Promotion flips `draft=0`, sets `current_version_id`, fires nothing.
6. **`app-lists` scaffold + shopping list integration** (recipe-derived only).
7. **Instagram ingestion** in `pops-worker-food`. Throwaway cookies. Caption-only path first; STT + vision second.
8. **Screenshot ingestion** (reuses Claude vision plumbing).
9. **Batches + cook events + planning UI.** Plan, mark-cooked, FIFO consumption.
10. **Substitution graph + cook-time UI.**
11. **Pantry-aware shopping list subtraction.** Closes the meal-prep loop.
12. **Cross-domain links** (finance grocery matching, cerebrum indexing) — separate PRDs in their own themes.

## What this spike intentionally does NOT decide

- Specific URL paths for the shell module (defer to module manifest convention).
- The TRPC router shape (defer to API conventions).
- Exact tag vocabulary (let it grow, curate after).
- Nutritional data (out of scope for v1; revisit only if it becomes asked-for).
- Multi-user/sharing semantics (POPS is single-user).
- iOS app design (separate problem).
