# Web URL Ingest — LLM Fallback Extraction

Status: **Partial** — the full readability → Claude → DSL pipeline is built, tested, and emits telemetry; the only gap is the dispatch glue. The live `url-web` handler still returns `JsonLdMissing` on a JSON-LD miss instead of invoking the LLM fallback, so `processWithLlm` is unreachable from production today. Wiring + the live-LLM e2e test are tracked in [ideas/web-llm-dispatch-wiring.md](../ideas/web-llm-dispatch-wiring.md).

## Purpose

For pages with no schema.org Recipe JSON-LD (indie blogs, prose-style recipe posts), extract the readable article text, hand it to Claude with a strict structured-extraction prompt, validate the JSON, and build a DSL string. One Claude call per ingest. The HTML-derived article, the raw model output, and per-stage timing all land in `meta.json` for the review queue. Cross-pillar usage/cost/latency is reported to the `ai` pillar.

This is the fallback branch of the `url-web` ingest kind; the JSON-LD fast path is the primary. Both share the same `IngestJobResult` contract and feed the worker-shell completion path (atomic recipe create + `ingest_sources` update). The handler never creates the recipe itself.

## Pipeline

`processWithLlm(html, data, finalUrl, opts)` in `src/worker/handlers/web-llm.ts` runs three stages over already-fetched HTML (the fetch + redirect resolution belong to the JSON-LD path):

1. **Readability** — `extractReadable(html, baseUrl)` wraps `@mozilla/readability` in JSDOM, returns `{ title, textContent, textLength, truncated }` or `null`. Pure: never fetches.
2. **Claude extraction** — `extractWithClaudeWebLlm(...)` issues one message via `@anthropic-ai/sdk`, wrapped in `@pops/ai-telemetry`'s `callWithLogging` so usage is reported to the ai pillar fire-and-forget.
3. **DSL build** — `buildWebLlmDsl(parsed, opts)` maps the validated recipe to a DSL string and derives the recipe slug.

Result is `{ ok: true, dsl, meta, partialReason? }` on success, or `{ ok: false, errorCode, errorMessage, meta }`. Cancellation is checked between stages (mid-call cancellation unsupported — the HTTP request runs to completion).

## Readability rules

- Reject (`null`) when Readability finds no article body, or the trimmed text is shorter than `WEB_LLM_MIN_READABLE_CHARS` (200) — too short to be a recipe; probably a redirect or login wall. Caller maps `null` to `NoExtractableContent`, no LLM call.
- Truncate text above `WEB_LLM_MAX_INPUT_CHARS` (15 000) to the first 15K chars before prompting; set `truncated: true`. `meta.stages.readability.truncated` surfaces it.

## Prompt & LLM call

- Prompt template + constants live in `src/worker/prompts/web-llm.ts`, versioned by `PROMPT_VERSION_WEB_LLM` (`web-llm-v1.0`). The template embeds the exact JSON schema and rules (prefer source slug, metric over imperial, `prep_state_slug` must be from the curated list else go to notes, step bodies may carry `@<slug>` refs, output ONLY JSON).
- Read-only viewer: registered in the app prompt registry, rendered at `/food/prompts` (`PromptViewerPage`).
- Single Claude call per ingest. Model from `WEB_LLM_DEFAULT_MODEL` (`claude-haiku-4-5-20251001`), overridable via `FOOD_WEB_LLM_MODEL` or a test seam. `max_tokens` = `WEB_LLM_MAX_OUTPUT_TOKENS` (2048).
- Telemetry: `callWithLogging` records `provider='anthropic'`, `domain='food'`, `operation='recipe-extract-web-llm'`, `contextId='ingest_source:<id>'`, `promptVersion`. Reporting is fire-and-forget; a slow/absent sink never alters handler behaviour.
- Cost: a local Haiku 4.5 estimate (input $0.25/Mtok, output $1.25/Mtok) is stamped on `meta.total_cost_usd`; the cross-pillar cost is priced independently against the ai pillar's pricing table inside `callWithLogging`.

## Response validation

- `parseLlmJson` rejects empty output and markdown-fenced output (leading ` ``` `) — the prompt says "Output ONLY the JSON". Fenced or unparseable → `malformed-json`.
- `extractedRecipeSchema` (zod, in `web-llm-recipe.ts`) validates shape: required `title`, `servings`, `yield_slug`, `yield_qty`, `yield_unit`, `ingredients[]`, `steps[]`; optional summary/times/tags/per-ingredient fields. Violations → `schema-violation`.
- Failures are returned as a typed `WebLlmExtractFailure` (`reason ∈ malformed-json | schema-violation | empty-response | sdk-error`), never thrown. The raw model output is preserved on `meta.llm_raw_output`. SDK/network errors map to `sdk-error`.

## DSL build & slug

`buildWebLlmDsl` (pure, `web-llm-dsl.ts`) emits a `@recipe(...)` header, a `@yield(...)`, one `@ingredient(...)` per item, and one `@step("...")` per step:

- Recipe slug = `slugify(title)` (NFKD, lowercase, kebab-case ASCII), falling back to `untitled-recipe`. Collision suffixing against `slug_registry` is left to the compiler (proposed-slug path), not done here.
- `variant_slug` → `variant="..."`; curated `prep_state_slug` → `prep="..."`; a `prep_state_slug` outside `CURATED_PREP_STATES` is rewritten into `notes` (`prep: <value>`) with the original preserved, and counted in `prepFallbackCount`.
- Quantities formatted compactly; strings escaped for the quoted-arg grammar. Step bodies pass through verbatim so `@<slug>` references survive for the resolver.

## Meta JSON & business rules

- `meta.stages` carries `readability` (`text_length`, `truncated`, `title`), `llm_extract` (`model`, `prompt_version`, `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms`, or failure `reason`/`message`), and `dsl_build` (`slug`, `prep_fallback_count`). `meta.llm_raw_output` and `meta.total_cost_usd` are set.
- LLM runs only on JSON-LD absence — never both paths for one ingest.
- Exactly one call per ingest; no retry-with-different-prompt. A failed/invalid call fails the ingest with `LlmExtractFailed`.
- If the model returns 0 ingredients **or** 0 steps, the ingest succeeds with `partialReason='empty-extraction'` so the review queue can surface it.
- The prompt instructs the model to keep the source's own slug ("rocket" not "arugula"); alias reconciliation is a later review-queue concern.

## Edge cases

| Case                                    | Behaviour                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Readability empty / < 200 chars         | `NoExtractableContent`; no LLM call.                                                |
| Body > 15K chars                        | Truncated to 15K; `truncated=true` in meta.                                         |
| Markdown-fenced or unparseable output   | `LlmExtractFailed` (`malformed-json`); raw preserved.                               |
| Valid JSON, missing required fields     | `LlmExtractFailed` (`schema-violation`); raw preserved.                             |
| 0 ingredients or 0 steps                | Success with `partialReason='empty-extraction'`.                                    |
| `prep_state_slug` not in curated list   | Pushed to ingredient `notes`; original preserved; counted in `prep_fallback_count`. |
| Anthropic key unset / SDK error         | `LlmExtractFailed` (`sdk-error`).                                                   |
| Step body `@<slug>` for an unknown slug | Passed through; compiler proposes the slug downstream.                              |

## Acceptance criteria

### Readability

- [x] `extractReadable(html, baseUrl)` uses `@mozilla/readability` + JSDOM; returns the article shape or `null`.
- [x] Rejects extractions shorter than 200 chars (`WEB_LLM_MIN_READABLE_CHARS`).
- [x] Truncates above 15K chars and sets `truncated`; meta records it (covered by fixture test).

### Prompt & LLM call

- [x] Prompt + `PROMPT_VERSION_WEB_LLM` exported from `src/worker/prompts/web-llm.ts`; rendered read-only at `/food/prompts`.
- [x] Single Claude call per ingest; model `claude-haiku-4-5-20251001`, overridable via `FOOD_WEB_LLM_MODEL`.
- [x] Output parsed strictly as JSON; markdown-fenced output rejected as `malformed-json`.
- [x] `extractedRecipeSchema` (zod) validates shape; violations fail as `schema-violation` with the raw preserved.

### DSL build

- [x] `buildWebLlmDsl(parsed, opts)` produces a DSL string per the grammar; slug derived from the title.
- [x] Step `@<slug>` references pass through verbatim.
- [x] Non-curated `prep_state_slug` rerouted to `notes`; original preserved and counted.

### Meta & telemetry

- [x] `meta.stages` populated for readability / llm_extract / dsl_build; `llm_raw_output` and `total_cost_usd` set.
- [x] `callWithLogging` reports `domain='food'`, `operation='recipe-extract-web-llm'`, `contextId='ingest_source:<id>'`, with `promptVersion`.

### Tests

- [x] Vitest suite at `src/worker/handlers/__tests__/web-llm.test.ts` (27 cases) covers readability rejection/truncation, happy path, markdown-fence, schema violation, and empty-extraction (0 ingredients / 0 steps), with the SDK client and telemetry mocked.
