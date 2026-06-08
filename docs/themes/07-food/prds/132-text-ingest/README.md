# PRD-132: Text Ingest

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

The simplest ingest path. User pastes plain text (a recipe they typed up, a recipe shared via SMS, a transcription from a video, a rough idea), the text routes through Claude as a structured-extraction prompt, draft lands in the review queue. One LLM call. No fetching, no media, no STT, no vision.

This path also serves the "rough recipe idea + LLM expansion" use case from the original spike — users can paste "smash burger with caramelised onions, basic" and the LLM elaborates into a full recipe. The prompt is permissive on input shape.

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/text.ts
export async function runTextIngest(
  data: IngestJobData & { kind: 'text' },
): Promise<IngestJobResult> {
  // 1. The body is in the job data already (PRD-125 stores it inline)
  if (!data.body || data.body.trim().length < 10) {
    return { ok: false, errorCode: 'EmptyText', ... };
  }

  // 2. LLM extraction
  const parsed = await extractWithClaudeText({ body: data.body });
  if (!parsed) return { ok: false, errorCode: 'LlmExtractFailed', ... };

  // 3. Build DSL and hand off to worker shell
  const dsl = buildDsl(parsed, { source: 'text' });
  const partialReason = (parsed.ingredients.length === 0 || parsed.steps.length === 0) ? 'empty-extraction' : undefined;
  return { ok: true, dsl, meta, partialReason };
}
```

## Claude text call

One call. Model defaults to `claude-haiku-4-5-20251001` (cheap; sufficient for structured extraction). Configurable via `FOOD_TEXT_LLM_MODEL`.

Prompt:

```
You are extracting (or elaborating on) a recipe from plain text. The text may be:
- A complete recipe (ingredients + steps)
- A rough recipe idea ("smash burger with caramelised onions") — in which case ELABORATE it into a full recipe, drawing on common cooking knowledge.
- A transcribed recipe (e.g. from a video) — clean it up and structure it.
- A recipe shared in a message format (SMS, chat) — normalise.

INPUT:
{body}

Extract or elaborate a recipe as JSON. Use this exact schema:

(... same schema as PRD-128 ...)

Rules:
- For ROUGH IDEAS: invent reasonable quantities and steps; mark `summary` with "Generated from rough idea".
- For COMPLETE RECIPES: stick close to the input; don't invent.
- Use metric units when reasonable.
- prep_state_slug MUST be one of: whole, diced, sliced, chopped, shredded, minced, julienned, grated, crushed, zested, juiced, melted, softened, mashed, roughly-chopped.
- Output ONLY the JSON. No markdown, no explanation.
```

Prompt as TS constant in `apps/pops-worker-food/src/prompts/text.ts` with `PROMPT_VERSION_TEXT`. Surfaced at `/food/prompts` (PRD-133).

Token budget: input ~50-2000 tokens depending on input length; output ~500-1500. Cost on Haiku 4.5: ~$0.001-0.005 per ingest.

## Meta JSON additions

```json
{
  "stages": {
    "input_validate": { "ok": true, "length": 420 },
    "llm_extract": {
      "ok": true,
      "duration_ms": 2100,
      "model": "claude-haiku-4-5-20251001",
      "prompt_version": "text-v1.0",
      "input_tokens": 580,
      "output_tokens": 720,
      "cost_usd": 0.0028
    },
    "dsl_build": { "ok": true, "duration_ms": 8 },
    "compile": { "ok": true, "duration_ms": 80, "creations": 2, "proposedSlugs": 0 }
  }
}
```

## Business Rules

- Body min length: 10 chars. Below that, reject as `EmptyText` (defensive; UI should validate earlier).
- Body max length: 20K chars (~5000 tokens). Truncate beyond and log truncation in meta.
- Single LLM call; same error-handling as PRDs 128 and 130 (malformed JSON → fail; zod violation → fail).
- The prompt explicitly handles two modes (rough idea vs complete recipe) — the LLM decides based on input shape. No UI distinction.
- Cancellation checked before LLM call; mid-call NOT supported.
- `ingest_sources.caption` populated with the original body (PRD-125 already does this).

## Edge Cases

| Case                                                                      | Behaviour                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Body is a single line: "burger"                                           | LLM elaborates into a generic burger recipe; summary marks "Generated from rough idea".                              |
| Body is 25K chars (long transcribed video)                                | Truncated to first 20K; LLM extracts from truncation. Meta records.                                                  |
| Body contains a list of multiple recipes                                  | LLM extracts the first one; summary notes multiplicity.                                                              |
| Body is in a non-English language                                         | LLM extracts in source language.                                                                                     |
| Body is gibberish ("asdjkfhlasjdkfh")                                     | LLM may invent a recipe (unlikely) or refuse. zod validation likely catches as `LlmExtractFailed`.                   |
| Body contains profanity / harmful content                                 | LLM may refuse via safety filter. `LlmExtractFailed` with refusal in error message.                                  |
| Body is a URL pasted as text (forgot to use url-web kind)                 | LLM may interpret as "recipe at URL" — output likely empty extraction → `partial`. User picks correct kind on retry. |
| LLM returns valid JSON but with `prep_state_slug` not in the curated list | Same handling as PRD-128: invalid prep pushed to `notes`, original preserved.                                        |
| LLM API rate-limited                                                      | BullMQ retries.                                                                                                      |

## Acceptance Criteria

Inline per theme protocol.

### Pipeline

- [ ] `runTextIngest(data)` exported from `apps/pops-worker-food/src/handlers/text.ts`.
- [ ] Validates body length (≥10 chars; truncates >20K).
- [ ] Single Claude API call per ingest.
- [ ] Exports `extractWithClaudeText(input: { body: string; source?: 'text' | 'ig-text-fallback' }): Promise<ExtractedRecipe | null>` from `apps/pops-worker-food/src/handlers/text.ts`. The `source` field changes only the `ai_inference_log.operation` value written by `callClaudeWithLogging`; the prompt template + JSON output schema are identical regardless of caller.
- [ ] PRD-130's vision-fallback path calls `extractWithClaudeText({ body: acq.caption, source: 'ig-text-fallback' })` — same signature.

### Prompt

- [ ] Prompt template exported from `apps/pops-worker-food/src/prompts/text.ts` with `PROMPT_VERSION_TEXT`.
- [ ] Model configurable via `FOOD_TEXT_LLM_MODEL`.

### DSL build

- [ ] Reuses `buildDsl(parsed, opts)` from PRD-128.
- [ ] Generated DSL compiles cleanly against PRD-116.

### Meta & logging

- [ ] Meta JSON populated per the shape above.
- [ ] `ai_inference_log` row per PRD-133 with `operation='recipe-extract-text'`.

### Tests

- [ ] Vitest suite at `apps/pops-worker-food/src/handlers/__tests__/text.test.ts` covers happy path + error states.
- [ ] Test cases: short rough idea, complete recipe paste, oversized input (>20K), gibberish input, multi-recipe input.

## Out of Scope

- Distinguishing rough-idea mode vs complete-recipe mode in the UI — single endpoint per theme decisions.
- Streaming LLM response — full completion only.
- Cost-cap enforcement — observation only.
- Multi-language translation — extract in source language.
- Voice-to-text frontend (user dictating instead of typing) — separate iOS app concern; not in v1.
- Re-elaboration of an existing recipe via text-LLM (i.e. "make this recipe more detailed") — out of scope; user manually edits via PRD-119.
