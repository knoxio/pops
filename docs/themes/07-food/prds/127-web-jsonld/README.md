# PRD-127: Web URL Ingest — JSON-LD Extraction

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

The fast path for recipe-website ingestion. Most major recipe sites (NYT Cooking, RecipeTinEats, Bon Appétit, Serious Eats, etc.) embed schema.org `Recipe` JSON-LD in their HTML. PRD-127 fetches the page, extracts the JSON-LD, maps it to the DSL, and produces a draft — no LLM call required. Pure deterministic parsing; sub-second after fetch.

When JSON-LD is absent or malformed, this PRD's handler returns a signal and PRD-128 (LLM fallback) takes over. Both PRDs share the `runWebUrlIngest` entry point but only PRD-127 owns the fast path.

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/web-url.ts (consumed by both PRDs 127 + 128)
export async function runWebUrlIngest(data: IngestJobData & { kind: 'url-web' }): Promise<IngestJobResult> {
  // 1. Fetch HTML
  const { html, finalUrl, status } = await fetchHtml(data.url);
  if (status !== 200) return { ok: false, errorCode: 'FetchFailed', ... };

  // 2. Try JSON-LD extraction (PRD-127)
  const jsonLd = extractRecipeJsonLd(html);
  if (jsonLd) {
    return await processJsonLdRecipe(jsonLd, data, finalUrl);
  }

  // 3. Fallback to LLM (PRD-128)
  return await processWithLlm(html, data, finalUrl);
}
```

### Step 1: Fetch

- `User-Agent: Mozilla/5.0 (compatible; POPS-Food-Ingest/1.0; +https://example.com)` — identifiable; respects robots.txt where it matters.
- Follow redirects up to 5 hops; capture final URL.
- Timeout: 15 seconds.
- Reject content-type that's not `text/html*`.
- Body size cap: 5 MB (recipe pages are rarely larger).

### Step 2: JSON-LD extraction

Walks `<script type="application/ld+json">` tags in the HTML, parses each, and finds the first node with `@type` === `"Recipe"` (or an array containing one). schema.org Recipe spec is the contract:

```json
{
  "@context": "https://schema.org/",
  "@type": "Recipe",
  "name": "Smash Burger",
  "description": "...",
  "image": "https://...",
  "author": { "@type": "Person", "name": "..." },
  "recipeYield": "4 servings",
  "prepTime": "PT5M",
  "cookTime": "PT10M",
  "totalTime": "PT15M",
  "recipeCategory": "Main",
  "recipeCuisine": "American",
  "recipeIngredient": ["500g beef chuck mince", "5g salt", "2g black pepper", "4 burger buns"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Divide chuck into 4 balls..." },
    { "@type": "HowToStep", "text": "Heat pan over high heat..." }
  ],
  "nutrition": {
    /* ignored in v1 */
  }
}
```

JSON-LD parser is permissive: many sites have malformed schemas (unquoted keys, trailing commas, mixed types). Use `jsonld` npm package's robust parser; on parse failure, skip and fall to PRD-128.

### Step 3: Map to DSL

The mapping is deterministic; no LLM involved:

| JSON-LD field                | DSL target                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `name`                       | `@recipe(title="...")`                                                         |
| `description`                | `@recipe(summary="...")`                                                       |
| `recipeYield`                | `@recipe(servings=N)` — parse integer; fallback to 4 if non-numeric            |
| `prepTime`                   | `@recipe(prep_time=N:min)` — parse ISO 8601 duration                           |
| `cookTime`                   | `@recipe(cook_time=N:min)`                                                     |
| `recipeIngredient[i]`        | `@ingredient(i+1, <best-effort-descriptor>, <best-effort-qty:unit>)`           |
| `recipeInstructions[i].text` | `@step("...")`                                                                 |
| `image` (first URL)          | Stored in `extracted_json.image_url`; Epic 03 review queue may suggest as hero |
| `recipeCategory`             | Added as a tag                                                                 |
| `recipeCuisine`              | Added as a tag                                                                 |

Ingredient lines are the lossy part: "500g beef chuck mince" → parsed via a small heuristic:

1. Regex for leading qty + unit (`/^(\d+(?:\.\d+)?)\s*([a-z]+)\b/i`). If matched: qty + unit + descriptor (remainder).
2. If no match: qty=1, unit=count, descriptor=whole line.
3. Slug the descriptor lowercase-with-hyphens: "beef chuck mince" → `beef-chuck-mince`. The DSL resolver (PRD-115) auto-creates as a new ingredient since this slug almost certainly doesn't exist canonically.
4. No attempt at variant/prep parsing in v1 — the LLM fallback handles that better; for JSON-LD we keep it dumb and let the user clean up in the review queue.

### Yield ingredient

JSON-LD doesn't declare a yield ingredient. Default heuristic: yield slug = recipe slug (e.g. recipe "smash-burger" yields ingredient "smash-burger"). PRD-115's resolver auto-creates the yield ingredient on compile. Quantity from `recipeYield` parsed; unit defaults to "count" or "serving" depending on what `recipeYield` text suggests.

### Step 4: Build draft

Construct the DSL string from the mapped fields and return `{ ok: true, dsl, meta }` from the handler. The worker shell then calls `food.ingest.workerComplete` (PRD-125) which atomically creates the recipe (via PRD-119's `food.recipes.create`) and updates `ingest_sources`. Compile runs as part of `create` (PRD-116); auto-creations populate; draft lands in the review queue.

The recipe **slug is derived inside `buildDsl`**: slugify the JSON-LD `name` field to kebab-case ASCII. If the slug collides with an existing entry in `slug_registry`, append a numeric suffix (`-2`, `-3`, ...) until unique. The DSL `@recipe(slug=...)` is always populated; PRD-119's `create` requires it.

## Meta JSON additions

```json
{
  "stages": {
    "fetch": {
      "ok": true,
      "duration_ms": 1240,
      "status": 200,
      "final_url": "...",
      "bytes": 142000
    },
    "jsonld_extract": { "ok": true, "duration_ms": 8, "schema_type": "Recipe" },
    "mapping": { "ok": true, "ingredients": 7, "steps": 5, "tags": 2 }
  }
}
```

No LLM stages; no AI usage logged for this path.

## Business Rules

- JSON-LD path is **deterministic** — same HTML in, same DSL out. No LLM, no randomness.
- Ingredient-line parsing is deliberately dumb — accept that descriptors will be slugs like `beef-chuck-mince`. The auto-create flow (PRD-115/116) creates ingredient rows for these; review queue (Epic 03) is the place to refine.
- Image URL is captured but not downloaded by this PRD. PRD-124's hero upload pipeline is the user-driven path. Auto-download from external URLs is a future enhancement.
- If JSON-LD presents multiple Recipe nodes (rare; some sites list variants), use the first; log a warning.
- Sites that gate behind login (require cookies for the recipe content): fetch returns the login page HTML; no Recipe JSON-LD found; fall to PRD-128 which will also fail. User sees "couldn't parse" in review queue.
- Sites that 4xx/5xx: `errorCode='FetchFailed'`, no draft created, BullMQ retries per policy.
- Per spec, sites MAY use multiple `recipeInstructions` types (`HowToStep`, `HowToSection`). v1 flattens both into steps; section headers are dropped. Future enhancement: preserve sections.
- Hero image `image` URL captured into `extracted_json.image_url` — the Epic 03 review queue may suggest it as a hero candidate during user approval (NOT PRD-119's recipe CRUD pages).

## Edge Cases

| Case                                                           | Behaviour                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| URL returns 404                                                | `FetchFailed` with HTTP status in error message; no draft; BullMQ retries 3x.                     |
| URL has JSON-LD but `@type` is `"Article"` not `"Recipe"`      | Skipped; falls to PRD-128.                                                                        |
| JSON-LD has nested `"@graph": [...]` with Recipe inside        | Walker handles `@graph`; finds Recipe node.                                                       |
| `prepTime` is not ISO 8601 (e.g. just "5 minutes")             | Heuristic parse: extract leading integer + "minutes"/"mins"/"min" suffix. Fallback to null.       |
| `recipeYield` is "4-6 servings"                                | Pick first number (4). Fallback to 4 if unparseable.                                              |
| Ingredient line has only descriptor (no qty)                   | qty=1, unit=count, descriptor=full line.                                                          |
| Ingredient line has metric AND imperial: "1 cup (240ml) milk"  | Take first match (1 cup); PRD-123 conversion table handles cup → ml. Imperial in parens dropped.  |
| Recipe has 0 ingredients (e.g. a technique-only page)          | Empty `@ingredient` list; compile produces a recipe with no `recipe_lines`. Allowed per PRD-116.  |
| Step text contains HTML (`<b>Important</b>`)                   | Strip HTML tags before placing into `@step("...")`. No raw HTML in DSL.                           |
| JSON-LD is well-formed but missing all major fields            | DSL build skips missing fields; recipe may have only title + servings. Compile may fail; partial. |
| HTML body > 5 MB                                               | Reject with `BodyTooLarge`; no draft.                                                             |
| Site returns gzip-encoded; fetch library handles transparently | Standard.                                                                                         |
| URL has tracking params (`?utm_source=...`)                    | Passed through to fetch; final URL stored. Normalisation deferred (PRD-110 edge case).            |
| Ingredient line starts with a fraction (`½ cup`, `1/2 tsp`)    | Heuristic supports unicode fractions and ASCII slashes; parses to 0.5.                            |

## Acceptance Criteria

Inline per theme protocol.

### Fetcher

- [ ] `fetchHtml(url)` helper handles 200/301/302/4xx/5xx; follows up to 5 redirects; 15s timeout; rejects non-HTML content-type and >5 MB body.
- [ ] Identifiable User-Agent string includes the project name.

### JSON-LD extractor

- [ ] Walks all `<script type="application/ld+json">` tags; parses each with the robust `jsonld` library.
- [ ] Finds the first node with `@type='Recipe'` (handles arrays and `@graph` containers).
- [ ] Returns null when no Recipe node found (triggers PRD-128 fallback).

### Mapper

- [ ] Maps each JSON-LD field per the table.
- [ ] ISO 8601 duration parser handles `PT5M`, `PT1H30M`, `PT45S`; fallback heuristic for plain-text durations.
- [ ] Ingredient line heuristic parses qty + unit + descriptor; handles unicode fractions and ASCII slashes; falls back to qty=1, unit=count.
- [ ] Step text stripped of HTML tags before placing in `@step("...")`.
- [ ] Yield ingredient defaults to recipe slug; qty parsed from `recipeYield`.

### End-to-end

- [ ] Vitest fixture suite at `apps/pops-worker-food/src/handlers/__tests__/web-jsonld.fixtures.test.ts` with at least 10 real-world recipe HTML samples (saved as fixtures under `apps/pops-worker-food/src/handlers/__tests__/fixtures/web/`).
- [ ] Each fixture asserts: JSON-LD detected; mapping produces a DSL string that compiles without errors (using PRD-116's compile against an in-memory DB).
- [ ] Integration test: a fixture for a page WITHOUT JSON-LD returns null from the extractor (triggers PRD-128).

### Observability

- [ ] Meta JSON populated with the stages described.
- [ ] No `ai_inference_log` rows created on this path (asserted by a test).

## Out of Scope

- LLM fallback for sites without JSON-LD — **PRD-128**.
- Hero image auto-download from `image` URL — deferred; capture in meta only.
- Multi-recipe page handling (e.g. roundups with 10 recipes) — picks first; future enhancement.
- Site-specific scrapers (one-off custom parsers per site) — deferred; JSON-LD is the contract.
- Robots.txt enforcement — POPS is single-user, low-volume; respect robots.txt when sites use it as a hard signal (return their 403 / 404 honestly) but no preflight robots.txt fetch in v1.
- Cookie / session handling for paywalled sites — out of scope.
- Cleanup of tracking params from URLs — deferred.
- Section-aware step parsing (preserving `HowToSection` boundaries) — deferred.
