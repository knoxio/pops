# PRD-128: Web URL Ingest — LLM Fallback Extraction

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

When PRD-127's JSON-LD path returns null (no Recipe schema on the page), this PRD takes over: extract the readable content from the HTML, hand the text to Claude with a structured-extraction prompt, parse the response, build a DSL string, write a draft. One Claude API call per ingest. The HTML and the LLM response are both stored in `meta.json` for audit.

Shares the `runWebUrlIngest` entry point with PRD-127 (which dispatches to this PRD on JSON-LD miss). Used for: blog-style recipe posts, smaller indie food blogs, anything without proper schema markup.

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/web-llm.ts
export async function processWithLlm(
  html: string,
  data: IngestJobData & { kind: 'url-web' },
  finalUrl: string,
): Promise<IngestJobResult> {
  // 1. Readability extraction
  const article = extractReadable(html, finalUrl);
  if (!article || article.textLength < 200) {
    return { ok: false, errorCode: 'NoExtractableContent', ... };
  }

  // 2. LLM extraction
  const result = await extractWithClaude({
    title: article.title,
    bodyText: article.text,
    url: finalUrl,
  });
  if (!result.ok) return { ok: false, errorCode: 'LlmExtractFailed', ... };

  // 3. Build DSL
  const dsl = buildDsl(result.parsed, { source: 'url-web', url: finalUrl });
  return { ok: true, dsl, meta, partialReason: deriveEmptyExtractionFlag(result.parsed) };
}
```

### Step 1: Readability

Use `@mozilla/readability` to strip nav / footer / ads / sidebars / comment sections and produce a clean article object:

```ts
{
  title: string;
  byline: string | null;
  textContent: string; // plain text
  content: string; // simplified HTML
  textLength: number;
  excerpt: string;
}
```

Reject if `textLength < 200` (too short to be a recipe; probably a redirect page or login wall).

### Step 2: Claude extraction

One call to `claude-haiku-4-5-20251001` (cheap; fast; structured-extraction is well within Haiku's capability). Prompt structure:

```
You are extracting a structured recipe from a webpage. The text below is the readable content of the page after stripping navigation and chrome.

Page title: {title}
Page URL: {url}

CONTENT:
{bodyText}

Extract a recipe as JSON. Use this exact schema:

{
  "title": "string — the recipe name",
  "summary": "string — one or two sentences describing the dish (optional)",
  "servings": number,
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional),
  "yield_slug": "string — kebab-case slug for the produced ingredient (e.g. 'smash-burger'); usually same shape as the recipe title",
  "yield_qty": number,
  "yield_unit": "count | serving | g | ml",
  "tags": ["string", ...] (cuisine, meal type, dietary — short list),
  "ingredients": [
    {
      "qty": number,
      "unit": "string — g, ml, count, cup, tbsp, tsp, oz, lb (any plain-text unit; conversion happens later)",
      "ingredient_slug": "string — kebab-case slug for the ingredient (e.g. 'beef-chuck')",
      "variant_slug": "string (optional) — kebab-case slug for variant (e.g. 'ground', 'fresh', 'canned')",
      "prep_state_slug": "string (optional) — one of: whole, diced, sliced, chopped, shredded, minced, julienned, grated, crushed, zested, juiced, melted, softened, mashed, roughly-chopped",
      "original_text": "string — the ingredient as it appeared in the source",
      "optional": boolean (default false),
      "notes": "string (optional)"
    }
  ],
  "steps": [
    {
      "body": "string — the step instruction; may reference ingredients by slug like @beef-chuck",
      "duration_minutes": number (optional)
    }
  ]
}

Rules:
- Prefer the actual ingredient slug from the source. If the source says "rocket", use 'rocket'. The system will reconcile aliases later.
- Use metric units when both are listed. Drop the imperial parenthetical.
- prep_state_slug MUST be one of the listed values. If the source describes a prep that doesn't match (e.g. "spiralised"), put it in notes instead.
- Step bodies may reference ingredients by slug with @-prefix; the system resolves these.
- Output ONLY the JSON. No markdown, no explanation.
```

Prompt as TS constant in `apps/pops-worker-food/src/prompts/web-llm.ts`. Read-only viewer at `/food/prompts` (PRD-133) renders it.

Token budget: input ~2000-5000 tokens for a typical recipe blog post; output ~500-1500 tokens. Cost on Haiku 4.5: under $0.005 per ingest.

### Step 3: Build DSL

The mapper takes the parsed JSON and emits a DSL string. Same approach as PRD-127 but with richer structure since the LLM produces variant/prep slugs and explicit yield. PRD-115's auto-create handles unknown slugs.

Step bodies that contain `@<slug>` references are passed through verbatim — the DSL grammar supports them (PRD-114), and the resolver handles unknowns by emitting `proposedSlug` entries.

### Step 4: Hand off to worker shell

Handler returns `{ ok: true, dsl, meta }` (with `partialReason='empty-extraction'` if the LLM produced 0 ingredients or 0 steps). The worker shell then calls `food.ingest.workerComplete` (PRD-125) which atomically creates the recipe and updates `ingest_sources`. Handler NEVER calls `food.recipes.create` directly.

The recipe **slug is derived inside `buildDsl`**: slugify `parsed.title` to kebab-case ASCII. If the slug collides with an existing entry in `slug_registry`, append a numeric suffix (`-2`, `-3`, ...) until unique. The DSL `@recipe(slug=...)` is always populated; PRD-119's `create` requires it.

## Prompt Versioning

The prompt template is versioned: change it = bump `PROMPT_VERSION_WEB_LLM` (a string constant exported alongside the template). The version string flows into:

- `meta.json.stages.llm_extract.prompt_version`
- `ai_inference_log.metadata` (per PRD-133)

This lets us correlate extraction quality with prompt changes over time and surface old extractions in the review queue with a "from prompt v1.2" badge.

## Meta JSON additions

```json
{
  "stages": {
    "fetch": { "ok": true, ... },
    "jsonld_extract": { "ok": false, "reason": "no-recipe-schema" },
    "readability": { "ok": true, "duration_ms": 180, "text_length": 4250, "title": "..." },
    "llm_extract": {
      "ok": true,
      "duration_ms": 2840,
      "model": "claude-haiku-4-5-20251001",
      "prompt_version": "web-llm-v1.0",
      "input_tokens": 3420,
      "output_tokens": 860,
      "cost_usd": 0.0040
    },
    "dsl_build": { "ok": true, "duration_ms": 12 },
    "compile": { "ok": true, "duration_ms": 90, "creations": 7, "proposedSlugs": 0 }
  }
}
```

PRD-133 also logs the call to `ai_inference_log` with `domain='food'`, `operation='recipe-extract-web-llm'`, `context_id=<sourceId>`.

## Business Rules

- LLM is invoked only when JSON-LD is absent. Never both paths for the same ingest.
- Single LLM call per ingest. No retry-with-different-prompt; if the call fails or returns invalid JSON, the ingest fails with `LlmExtractFailed`.
- Response parsing is strict JSON.parse (no markdown fences allowed). If the model wraps in fences, treat as malformed and fail. The prompt explicitly says "Output ONLY the JSON".
- Output validated against the JSON schema via zod (or similar) before mapping. Any schema violation → fail with details in error message.
- Cost cap: enforced by PRD-133's `callClaudeWithLogging` wrapper — when a single Claude call exceeds `FOOD_INGEST_COST_CAP_PER_JOB_USD` (default 0.05 USD), a warning is logged to `ai_inference_log.metadata.over_cost_cap`. v1 does NOT abort on overrun — observation only.
- The prompt instructs the model to use whatever slug the source uses ("rocket" not "arugula"). Alias reconciliation happens in the review queue (Epic 03) where the user can mark "rocket" as an alias for the canonical "arugula".
- If the LLM returns 0 ingredients OR 0 steps, the ingest succeeds but with `state='partial'` and `partialReason='empty-extraction'`. Review queue surfaces these for the user to either fix or reject.
- Cancellation: checked between fetch + LLM + build steps. Mid-LLM-call cancellation is not supported (HTTP request runs to completion).

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Readability returns empty / very short text                                       | `NoExtractableContent`; no LLM call; fail.                                                                                     |
| Readability returns 50K+ chars (recipe deep in a long blog post)                  | Truncate to first 15K chars before prompt; log truncation in meta.                                                             |
| LLM returns malformed JSON (markdown fence, prose explanation)                    | `LlmExtractFailed` with the raw response in error message.                                                                     |
| LLM returns valid JSON but missing required fields (no `title`, no `ingredients`) | zod validation fails; `LlmExtractFailed`. Raw response preserved in meta.                                                      |
| LLM returns 0 ingredients                                                         | Draft created with state=`partial`, `partialReason='empty-extraction'`. Surfaces in review queue.                              |
| LLM returns a `prep_state_slug` not in the curated list                           | DSL build maps invalid prep to `notes` field instead; original prep value preserved in notes.                                  |
| LLM API rate-limited (429)                                                        | BullMQ retries per default policy.                                                                                             |
| LLM API down (5xx)                                                                | BullMQ retries.                                                                                                                |
| Anthropic API key invalid                                                         | First job fails with `LlmExtractFailed`; subsequent jobs same. Operator updates `ANTHROPIC_API_KEY`.                           |
| Page is paywalled — readability returns paywall message                           | Likely passes the 200-char minimum but produces a useless extraction. Draft surfaces with state=partial; review queue rejects. |
| Page in non-English language                                                      | LLM extracts in the source language; user reviews. Translation deferred.                                                       |
| Step body has `@<slug>` for an ingredient slug that doesn't exist anywhere        | PRD-115 emits proposedSlug; review queue surfaces. Step still renders with the unresolved chip.                                |

## Acceptance Criteria

Inline per theme protocol.

### Readability

- [ ] `extractReadable(html, baseUrl)` uses `@mozilla/readability`; returns `{ title, textContent, textLength, ... }` or null.
- [ ] Rejects extractions shorter than 200 chars.
- [ ] Truncates extractions longer than 15K chars; meta records the truncation.

### Prompt & LLM call

- [ ] Prompt template exported from `apps/pops-worker-food/src/prompts/web-llm.ts` with `PROMPT_VERSION_WEB_LLM` string.
- [ ] Single Claude API call per ingest; model `claude-haiku-4-5-20251001` (configurable via `FOOD_WEB_LLM_MODEL`).
- [ ] Response parsed strictly as JSON; markdown-fenced output rejected.
- [ ] zod schema validates the response shape; violations fail with details.

### DSL build

- [ ] `buildDsl(parsed, opts)` produces a valid DSL string per ADR-023 grammar.
- [ ] Step body `@<slug>` references passed through verbatim.
- [ ] Invalid `prep_state_slug` values pushed to `notes` field; original preserved.
- [ ] Generated DSL compiles cleanly (verified via PRD-116 compile against fixture data).

### Meta & logging

- [ ] Meta JSON populated with all stages per the shape above.
- [ ] `ai_inference_log` row inserted per PRD-133 with correct `domain`, `operation`, `context_id`.
- [ ] Prompt version recorded in both `meta.json` and `ai_inference_log.metadata`.

### Tests

- [ ] Vitest fixture suite at `apps/pops-worker-food/src/handlers/__tests__/web-llm.test.ts` with at least 5 fixtures of HTML pages WITHOUT JSON-LD; LLM mocked.
- [ ] Mocked LLM returns happy-path, malformed-JSON, empty-ingredients, and zod-violation responses; each asserts the right outcome.
- [ ] One end-to-end test with a real LLM call (gated on `RUN_LIVE_LLM_TESTS=1`; skipped in CI by default).

## Out of Scope

- JSON-LD parsing — **PRD-127**.
- Site-specific extractors (one-off custom prompts per site) — deferred.
- Cost-cap enforcement (hard abort on overrun) — observation only in v1.
- Retry-with-different-prompt logic — single attempt.
- Multi-language translation — extract in source language; user reviews.
- Image extraction beyond what JSON-LD provides — deferred.
- Streaming LLM response — single completion in v1.
- Self-hosted LLM (e.g. local Qwen) — Claude API only; future PRD could add provider abstraction.
