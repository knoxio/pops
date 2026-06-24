# Web JSON-LD ingest — deferred extensions

Forward-looking work for the deterministic web-URL JSON-LD path (`prds/web-jsonld`). The fast path is built; these are the pieces specified earlier that the live handler does not yet do.

## Hero-image URL capture

The schema.org `image` field (first URL) is currently ignored by the mapper. Capture it into the ingest meta (e.g. `extracted_json.image_url`) so the review queue can later suggest it as a hero candidate during user approval. The PRD never auto-downloads external images — capture only; the user-driven hero upload pipeline stays the path that actually fetches bytes.

## Real recipe tags

`recipeCategory` and `recipeCuisine` are slugified and emitted as DSL **comments** (`// tag: main`, `// tag: american`) today, so they survive parsing but carry no semantics. Promote them to real tags: emit a tag construct the DSL/compiler understands, and wire into the recipe tag model so category/cuisine become queryable facets rather than inert comments.

## Live slug-registry collision suffixing

`disambiguateSlug(slug, reserved)` already appends `-2`, `-3`, … but the production handler (`runWebUrlIngest`) calls the mapper with an empty reserved set, so two ingests of the same recipe name produce the same base slug and collide downstream. Wire the live `slug_registry` contents into `WebUrlIngestDeps.reservedSlugs` so suffixing actually disambiguates against existing entries at enqueue/handle time.

## Section-aware steps

`HowToSection` is flattened into its steps and the section name is dropped. Preserve section boundaries/headers so multi-section recipes (e.g. "For the sauce" / "For the assembly") keep their structure in the DSL.

## URL normalisation

Tracking params (`?utm_source=…`) are passed through to fetch verbatim; the final URL is stored as-is. Strip known tracking params before fetch / before storing so the same recipe via two share links dedupes.

## Multi-recipe pages

Roundup pages with several Recipe nodes: today the walker takes the first. A future enhancement could surface all of them (or let the user pick) instead of silently dropping the rest.

## Robots.txt / paywall awareness

No preflight robots.txt fetch; paywalled/login-gated pages return the login HTML, no Recipe node is found, and the job fails as `JsonLdMissing`. Out of scope for v1 (single-user, low-volume) but noted: cookie/session handling and an explicit robots signal could be added later.
