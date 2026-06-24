# Web URL Ingest — JSON-LD Extraction

**Status: Partial.** The fast path is built end-to-end (fetch → JSON-LD extract → deterministic DSL map → result with meta stages), exercised by an 11-fixture suite. Three deferred pieces live in `../../ideas/web-jsonld-extensions.md`: hero-image-URL capture into the meta, real recipe tags (today category/cuisine land as DSL comments), and live `slug_registry` collision suffixing (the disambiguation helper exists but the production handler runs with an empty reserved set). When no Recipe JSON-LD is present the handler returns a `JsonLdMissing` failure — the LLM fallback that should take over is its own PRD (`web-llm-fallback`).

The fast path for recipe-website ingestion. Most major recipe sites (NYT Cooking, RecipeTinEats, Bon Appétit, Serious Eats) embed schema.org `Recipe` JSON-LD in their HTML. This path fetches the page, extracts the JSON-LD, maps it to the recipe DSL, and produces a draft with no LLM call — pure deterministic parsing, sub-second after fetch.

The handler is `runWebUrlIngest`, registered for `kind: 'url-web'` in the worker dispatch (`pillars/food/src/worker`). It writes no `ai_inference_log` rows.

## Pipeline

`runWebUrlIngest(data, ctx)` runs three stages, each recorded under `meta.stages`. Cancellation is checked between stages; a cancelled job returns `errorCode: 'Cancelled'`.

1. **Fetch** — `fetchHtml(url)` over the Undici `fetch` global.
2. **Extract** — `extractRecipeJsonLd(html)` walks `<script type="application/ld+json">` blocks for the first Recipe node. `null` ⇒ `JsonLdMissing` failure.
3. **Map** — `mapJsonLdToDsl(recipe)` builds the DSL string; the job result is `{ ok: true, dsl, meta }`.

The worker shell then POSTs the DSL back to the food pillar's internal `POST /ingest/worker-complete` route (the `workerComplete` ts-rest endpoint, gated by `x-pops-internal-token`), which creates the recipe + draft; compile and auto-creation happen downstream (see the `recipe-model` and `dsl-resolver` PRDs).

## Fetch contract

- Identifiable User-Agent (includes the project name).
- Follows up to 5 redirects (cap enforced explicitly; Undici default is higher); captures the final URL.
- 15 s per-request timeout via `AbortSignal.timeout`.
- Rejects non-HTML content-type (`text/html` / `application/xhtml+xml`) ⇒ `NotHtml`.
- Streams the body with a 5 MB cap so a hostile large body never fully buffers ⇒ `BodyTooLarge`.
- Non-2xx ⇒ `FetchFailed` (HTTP status in message). Timeout ⇒ `FetchTimeout`.

## JSON-LD extraction

Each `<script type="application/ld+json">` block is parsed independently — one malformed block must not poison the others (a JSON parse failure skips that block, not the page). The walker descends only the schema.org envelope slots (`@graph`, `mainEntity`, `mainEntityOfPage`, `itemReviewed`) plus raw arrays, and returns the first node whose `@type` is (or contains) `Recipe` (matches bare `"Recipe"` and namespaced `".../Recipe"`). No Recipe node ⇒ returns `null`.

## DSL mapping

Deterministic; same HTML in, same DSL out. The emitted DSL is:

```
@recipe(slug="...", title="...", servings=N[, prep_time=N:min][, cook_time=N:min][, summary="..."])
@yield(<slug>, <qty>:<unit>)
@ingredient(<i>, <descriptor-slug>, <qty>:<unit>)   // one per recipeIngredient line
@step("...")                                         // one per instruction
// tag: <slug>                                       // recipeCategory / recipeCuisine, as comments
```

| JSON-LD field                    | Mapping                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                           | `title`; slugified to the recipe `slug` (fallback `"Untitled Recipe"` → `recipe`).                                                                     |
| `description`                    | `summary` (trimmed; dropped if empty).                                                                                                                 |
| `recipeYield`                    | `servings` and the `@yield` qty/unit. First number wins; unparseable ⇒ `4`; unit defaults to `serving`, else the slugified noun (`cookies`, `loaves`). |
| `prepTime` / `cookTime`          | `prep_time` / `cook_time` in minutes; field dropped if it parses to nothing (never emits `0:min`).                                                     |
| `recipeIngredient[i]`            | `@ingredient(i+1, <descriptor-slug>, <qty>:<unit>)`.                                                                                                   |
| `recipeInstructions`             | flattened to `@step(...)`.                                                                                                                             |
| `recipeCategory`/`recipeCuisine` | slugified, emitted as `// tag:` DSL comments (not real tags — see ideas).                                                                              |
| `image`                          | not captured (see ideas).                                                                                                                              |

**Duration parse** — strict ISO 8601 first (`PT5M`, `PT1H30M`, `PT45S`), then a permissive heuristic for plain text (`"5 minutes"`, `"1 hr 30 min"`, bare integer). Returns `null` when nothing parses.

**Ingredient-line heuristic** (deliberately dumb — descriptors become slugs like `beef-chuck-mince`; the user refines in the review queue):

- Strips HTML tags and parenthetical groups (`1 cup (240ml) milk` → drops `(240ml)`).
- Reads a leading quantity: integers, decimals, unicode fractions (`½`, `⅔`), mixed `2¼`, ASCII fractions and mixed `1 1/2`. Rounds to 3 dp.
- Reads a known unit token (sticky `500g` or spaced), aliased to a canonical slug (`tablespoon`→`tbsp`, `ounces`→`oz`, `piece`→`count`, …). Unknown token ⇒ unit `count`, whole remainder is descriptor.
- No quantity ⇒ `qty=1, unit=count, descriptor=full line`. Empty descriptor ⇒ sentinel slug `ingredient` (avoids colliding with the recipe slug `recipe`).

**Instruction flatten** — handles a single string (split coarsely on sentence boundaries), an array of strings, `HowToStep` objects (`text`/`description`/`name`), and `HowToSection` (recurses into `itemListElement`/`steps`; section names dropped). HTML tags and `&nbsp;`/`&amp;` are stripped.

**Slug** — slugify lowercases, NFKD-strips diacritics, maps `ß/œ/æ`, collapses non-`[a-z0-9]` to hyphens, prepends `r-` if it would start with a digit, falls back to `recipe`. `disambiguateSlug` appends `-2`, `-3`, … against a reserved set — but the production handler currently passes an empty reserved set, so live collision suffixing is not yet active (see ideas).

## Meta

```json
{
  "extractor_version": "web-jsonld@1",
  "stages": {
    "fetch": {
      "ok": true,
      "duration_ms": 1240,
      "status": 200,
      "final_url": "...",
      "bytes": 142000
    },
    "jsonld_extract": { "ok": true, "duration_ms": 8, "schema_type": "Recipe" },
    "mapping": { "ok": true, "duration_ms": 3, "ingredients": 7, "steps": 5, "tags": 2 }
  }
}
```

Failure stages carry `ok: false` + `reason` (and fetch carries `status`/`final_url`). No LLM stages; no AI cost logged.

## Edge cases

| Case                                                  | Behaviour                                             |
| ----------------------------------------------------- | ----------------------------------------------------- |
| Non-2xx (404/5xx)                                     | `FetchFailed`; no draft.                              |
| Non-HTML content-type                                 | `NotHtml`; no draft.                                  |
| Body > 5 MB                                           | `BodyTooLarge`; no draft (capped mid-stream).         |
| JSON-LD present but `@type` is `Article`              | No Recipe node ⇒ `JsonLdMissing`.                     |
| `@graph` / `mainEntity` envelope with a Recipe inside | Walker descends and finds it.                         |
| One malformed `ld+json` block among several           | That block is skipped; others still parsed.           |
| `prepTime` plain text (`"5 minutes"`)                 | Heuristic parse; else field dropped.                  |
| `recipeYield` `"4-6 servings"`                        | First number (4).                                     |
| Ingredient with no qty                                | `qty=1, unit=count, descriptor=full line`.            |
| `1 cup (240ml) milk`                                  | First match (`1 cup`); parenthetical dropped.         |
| 0 ingredients (technique page)                        | Empty `@ingredient` list; downstream compile decides. |
| Step text contains HTML                               | Tags stripped before `@step(...)`.                    |
| `½ cup` / `1/2 tsp`                                   | Parsed to `0.5`.                                      |
| `HowToSection` instructions                           | Flattened to steps; section header dropped.           |

## Acceptance criteria

### Fetch

- [x] `fetchHtml` handles 2xx/redirect/4xx/5xx, follows up to 5 redirects, captures final URL, 15 s timeout.
- [x] Rejects non-HTML content-type (`NotHtml`) and >5 MB body (`BodyTooLarge`, capped while streaming).
- [x] Identifiable User-Agent including the project name.

### Extractor

- [x] Walks every `ld+json` block; parses each independently so one bad block doesn't poison the page.
- [x] Finds the first `@type='Recipe'` node, descending `@graph`/`mainEntity`/`mainEntityOfPage`/`itemReviewed` and arrays.
- [x] Returns `null` when no Recipe node ⇒ handler emits `JsonLdMissing` (fallback signal).

### Mapper

- [x] Maps name/description/yield/prepTime/cookTime/ingredients/instructions per the table.
- [x] ISO-8601 duration parser (`PT5M`, `PT1H30M`, `PT45S`) plus plain-text heuristic; drops the field on no parse.
- [x] Ingredient heuristic: leading qty (unicode + ASCII fractions, mixed), known-unit token with aliasing, fallback `qty=1, unit=count`; strips parentheticals and HTML.
- [x] Instruction flatten covers single string, string array, `HowToStep`, `HowToSection`; HTML stripped.
- [x] `recipeYield` → servings + `@yield` qty/unit; unparseable ⇒ 4 servings.
- [x] `recipeCategory`/`recipeCuisine` emitted as `// tag:` comments (real tags deferred — ideas).
- [x] Slug derived from `name`; `disambiguateSlug` helper exists (live collision suffixing deferred — ideas).

### End-to-end

- [x] Fixture suite (`src/worker/__tests__/web-jsonld.fixtures.test.ts`) with ≥10 real-world recipe HTML samples under `__tests__/fixtures/web/`; each asserts a Recipe node is found and the mapped DSL parses via the recipe DSL parser.
- [x] A no-JSON-LD fixture asserts the extractor returns `null` (fallback path stays tested).

### Observability

- [x] `meta.stages` populated for fetch / jsonld_extract / mapping.
- [x] No `ai_inference_log` rows on this path (asserted in the fixture suite).
