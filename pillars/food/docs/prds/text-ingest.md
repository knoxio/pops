# Text Ingest

Status: Done — text body → one Claude extraction call → recipe DSL draft in the review queue. Shipped end-to-end (REST start, worker handler, retry-from-caption).

## Purpose

The simplest ingest path. A user pastes plain text — a typed-up recipe, an SMS-shared recipe, a video transcription, or a rough idea — and it routes through Claude as a structured-extraction prompt; the resulting DSL draft lands in the review queue. One LLM call, no fetching, no media, no STT, no vision.

The same prompt also serves the "rough idea + LLM expansion" case: paste `smash burger with caramelised onions` and the LLM elaborates a full recipe. The prompt is permissive on input shape and decides between _elaborate_ and _extract_ on its own — there is no UI distinction.

## Surface

Text ingest enters through the shared ingest REST contract (`pillars/food/src/contract/rest-ingest.ts`), not a dedicated endpoint:

- `POST /ingest/start` with `{ kind: 'text', body }` (`body` non-empty). The food-api producer writes an `ingest_sources` row with `caption = body` and enqueues `{ kind: 'text', sourceId, body }` on the `food.ingest` BullMQ queue. Returns 503 when Redis is not configured.
- `POST /ingest/retry` rebuilds the job from the persisted `caption` (`{ kind: 'text', sourceId, body: caption }`); a `text` source with a null caption is unretryable and the producer rejects the retry.

Worker dispatch (`pillars/food/src/worker/dispatch.ts`) routes `kind: 'text'` to `runTextIngest` via the typed handler registry.

## Pipeline

`runTextIngest` (`pillars/food/src/worker/handlers/text.ts`):

1. Trim `body`. Reject `< 10` chars as `EmptyText`. Truncate `> 20_000` chars to the first 20K and record `truncated: true` in meta.
2. Cancellation check before the LLM call (mid-call cancellation is out of scope).
3. `extractWithClaudeText({ body, source: 'text', contextId: 'ingest_source:<sourceId>' })` — one Claude call.
4. On success, `buildDsl(parsed, { source: 'text' })` renders the recipe DSL; flag `partialReason: 'empty-extraction'` when the extraction has 0 ingredients or 0 steps.

`extractWithClaudeText` (`pillars/food/src/worker/handlers/extract-with-claude.ts`) is the shared text-LLM surface. Its `source` field (`'text' | 'ig-text-fallback'`) only selects the `ai_inference_log.operation` value (`recipe-extract-text` vs `recipe-extract-ig-text-fallback`); the prompt template, JSON schema, and model are identical. The Instagram vision-fallback path (`instagram-stt-vision`) reuses it with `source: 'ig-text-fallback'`.

## Claude call

One call. Model defaults to `claude-haiku-4-5-20251001` (cheap, sufficient for structured extraction), overridable via `FOOD_TEXT_LLM_MODEL`. `temperature: 0`, `max_tokens: 2048`. Returns null/failure when `ANTHROPIC_API_KEY` is unset.

Prompt template + `PROMPT_VERSION_TEXT` (`text-v1.0`) live in `pillars/food/src/worker/prompts/text.ts`. The instruction tells the LLM to elaborate rough ideas (marking `summary` "Generated from rough idea"), stick close to complete recipes, prefer metric units, and constrain `prep_state_slug` to the curated set (`whole, diced, sliced, chopped, shredded, minced, julienned, grated, crushed, zested, juiced, melted, softened, mashed, roughly-chopped`). Output is JSON only. The JSON schema mirrors the web-LLM fallback (`web-llm-fallback`) so the same `extractedRecipeSchema` zod validator and `buildDsl` mapper are reused across kinds.

Claude is wrapped by `callWithLogging` (`@pops/ai-telemetry`), which writes one `ai_inference_log` row per call with `operation`, `domain='food'`, `provider='anthropic'`, `promptVersion`, `contextId`, and token usage. Surfaced at `/food/prompts` (`ai-usage-prompts`).

## Meta JSON

`runTextIngest` populates the shared `IngestMeta` envelope (`pillars/food/src/contract/queue/index.ts`):

- `input_validate`: `{ ok, length, truncated }` (or `{ ok: false, reason: 'below-min' }`).
- `llm_extract`: `{ ok, duration_ms, model, prompt_version, input_tokens, output_tokens }`; on failure `{ ok: false, duration_ms, model, prompt_version, reason }` plus a `raw_output_preview` (≤1024 chars) when output was non-JSON.
- `dsl_build`: `{ ok, duration_ms }`.
- `llm_raw_output`: the parsed LLM output (raw string when not JSON).

## Business rules

- Body min 10 chars (after trim) → `EmptyText` (defensive; UI validates earlier). Whitespace-only is `EmptyText`.
- Body max 20K chars → truncate, extract from the truncation, record it.
- Exactly one Claude call per ingest.
- Malformed JSON → `LlmExtractFailed`; zod-schema violation → `LlmExtractFailed`. Empty-string numerics (e.g. `servings: ""`) must fail, not coerce to 0.
- Failure path records real `duration_ms` (never a hardcoded 0) so slow timeouts stay visible.
- `ingest_sources.caption` holds the original body; it is the retry source of truth.

## Edge cases

| Case                                       | Behaviour                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Single line ("burger")                     | LLM elaborates a generic recipe; `summary` marks "Generated from rough idea".   |
| 25K-char transcribed video                 | Truncated to first 20K; extracts from truncation; meta records `truncated`.     |
| Multiple recipes in one body               | LLM extracts the first only.                                                    |
| Non-English body                           | Extracted in source language (no translation).                                  |
| Gibberish ("asdjkfhlasjdkfh")              | LLM refuses or produces JSON that fails zod → `LlmExtractFailed`.               |
| Profanity / harmful content                | Safety filter refusal → `LlmExtractFailed` with refusal in the message.         |
| URL pasted as text (wrong kind)            | Likely empty extraction → `partial`; user retries with the correct kind.        |
| `prep_state_slug` outside the curated list | Same as `web-llm-fallback`: invalid prep pushed to `notes`, original preserved. |
| LLM rate-limited / network error           | `LlmExtractFailed`; BullMQ retries the job.                                     |

## Acceptance criteria

### Pipeline

- [x] `runTextIngest(data, ctx)` exported from `pillars/food/src/worker/handlers/text.ts`, wired into the worker dispatch registry for `kind: 'text'`.
- [x] Validates body length (≥10 chars after trim; truncates >20K, recording `truncated`).
- [x] Cancellation short-circuits before the LLM call; the mock client's `create` is never invoked.
- [x] Exactly one Claude call per ingest.
- [x] Exports `extractWithClaudeText({ body, source: 'text' | 'ig-text-fallback', contextId })`; `source` changes only the logged `operation`, prompt + schema + model are identical.
- [x] The `instagram-stt-vision` vision-fallback path calls `extractWithClaudeText({ ..., source: 'ig-text-fallback' })` against the same surface.

### Prompt

- [x] Prompt template + `PROMPT_VERSION_TEXT` (`text-v1.0`) exported from `pillars/food/src/worker/prompts/text.ts`.
- [x] Model configurable via `FOOD_TEXT_LLM_MODEL` (default `claude-haiku-4-5-20251001`).

### DSL build

- [x] Reuses `buildDsl(parsed, { source: 'text' })`; flags `partialReason: 'empty-extraction'` on 0 ingredients or 0 steps.
- [x] Generated DSL satisfies the recipe grammar (`@recipe(...)`, `@yield(...)`, `@ingredient(n, slug, qty:unit ...)`, `@step("...", duration=n:min)`).

### Meta & logging

- [x] Meta JSON populated with `input_validate`, `llm_extract`, `dsl_build`, and `llm_raw_output`.
- [x] One `ai_inference_log` row per call with `operation='recipe-extract-text'` (`recipe-extract-ig-text-fallback` for the fallback source), `domain='food'`, token usage, and `contextId='ingest_source:<id>'`.

### Tests

- [x] Vitest suite at `pillars/food/src/worker/handlers/__tests__/text.test.ts` covers validation, happy path, grammar shape, rough-idea elaboration, partial flagging, truncation, multi-recipe (first-only), non-JSON / schema-violation / empty-numeric failures, missing API key, and the `ig-text-fallback` operation.

## Out of scope

- Rough-idea vs complete-recipe distinction in the UI — single endpoint.
- Streaming LLM responses — full completion only.
- Cost-cap enforcement — observation only.
- Multi-language translation — extract in source language.
- Voice-to-text frontend — separate iOS concern.
- Re-elaborating an existing recipe via text-LLM — user edits manually.
