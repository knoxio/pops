# Screenshot Ingest

Status: Done — one Claude vision call turns a single image (recipe screenshot, cookbook-page photo, handwritten note, chat-app share) into a recipe DSL draft.

The smallest ingest path: no yt-dlp, no STT, no ffmpeg. The image arrives as a base64 payload on `POST /ingest/start`, the food API writes it to disk before enqueue, and the worker reads it, runs vision, builds DSL, and posts the result back.

## Flow

1. **Producer** (`src/api/modules/ingest/`): `POST /ingest/start` with `{ kind: 'screenshot', mimeType, contentBase64 }` creates an `ingest_sources` row, decodes the base64 to `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>`, then enqueues a BullMQ job carrying only `{ kind, sourceId, mimeType, contentPath }` (binaries never go in Redis).
2. **Worker** (`src/worker/handlers/screenshot.ts` → `runScreenshotIngest`): reads the file, runs one vision call, parses + validates JSON, builds DSL, assembles the meta rollup.
3. **Completion**: worker posts `IngestJobResult` to `POST /ingest/worker-complete` (internal, gated by `x-pops-internal-token`). On success the API creates an **uncompiled** draft recipe (slug `ingest-source-<sourceId>`, first version) and persists the meta rollup on the source row; on failure it writes `error_code` / `error_message` + meta. The compile pass is deferred — it runs lazily when the user approves the draft from the inbox. The inbox state (`completed` / `partial` / `failed`) is derived downstream by combining the BullMQ job state with the persisted row, not written here.

Worker dispatch is a per-kind registry (`src/worker/handlers/index.ts`); `screenshot` maps to `runScreenshotIngest`, typecheck-enforced exhaustive.

## REST surface (shared ingest contract, `src/contract/rest-ingest.ts`)

| Method + path                  | Purpose                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `POST /ingest/start`           | Enqueue. Screenshot variant body: `{ kind: 'screenshot', mimeType, contentBase64 }`. 503 when Redis unavailable. |
| `POST /ingest/status`          | Live job + persisted state for one source.                                                                       |
| `POST /ingest/list`            | Cursor-paginated sources for the inbox UI.                                                                       |
| `POST /ingest/cancel`          | Best-effort cancel of a queued job.                                                                              |
| `POST /ingest/retry`           | Re-enqueue a failed job from its persisted row.                                                                  |
| `POST /ingest/worker-complete` | Internal worker callback (success or failure), token-gated.                                                      |

## Vision call

Single image, no other inputs. `extractWithClaudeVision` (`src/worker/ai/anthropic-client.ts`) sends `[image, prompt]` to Claude, `max_tokens` 2048, `maxRetries: 0`. Accepted MIME: `image/jpeg`, `image/png`, `image/webp` (asserted both at the API input schema and again in the vision helper). API key read lazily so tests run without it.

- Model: `claude-haiku-4-5-20251001`, overridable via `FOOD_SCREENSHOT_VISION_MODEL`.
- Prompt + version are TS constants in `src/worker/prompts/screenshot.ts` (`SCREENSHOT_PROMPT`, `PROMPT_VERSION_SCREENSHOT = 'screenshot-v1.0'`), mirrored in the app's prompt registry so the prompt viewer renders it without round-tripping through git.
- Cost is estimated locally from hard-coded Haiku pricing for the meta rollup; authoritative usage/cost/latency is reported fire-and-forget to the `ai` pillar via `@pops/ai-telemetry` `callWithLogging` with `operation='recipe-extract-screenshot'`, `domain=food`.

## Extracted-recipe schema → DSL

Vision returns strict JSON validated by `parsedRecipeSchema` (`src/worker/handlers/screenshot-dsl.ts`): `title`, optional `summary`, `servings`, optional `prep_time_minutes` / `cook_time_minutes`, `yield_slug` / `yield_qty` / `yield_unit`, `tags`, `ingredients[]`, `steps[]`. Ingredient slugs are kebab-case; `prep_state_slug` is constrained to a closed enum (`whole`, `diced`, `sliced`, … `roughly-chopped`) — anything else is rejected, and the prompt instructs the model to fall back to `notes`.

`buildDsl(parsed, { source: 'screenshot' })` renders a grammar-compliant DSL string (`@recipe(...)`, `@yield(...)`, `@ingredient(...)`, `@step(...)`), slugifying the title, escaping strings, and normalising qty/unit. The worker-complete callback stores this DSL as the body of a new uncompiled draft version; compilation is deferred to the inbox approve flow.

## Meta rollup (`IngestMeta`, persisted on the source row)

`extractor_version` (`pops-worker-food/screenshot@<v>`) plus per-stage records:

```json
{
  "stages": {
    "file_read": { "ok": true, "duration_ms": 5, "bytes": 580000 },
    "vision":    { "ok": true, "duration_ms": 4200, "model": "claude-haiku-4-5-20251001",
                   "prompt_version": "screenshot-v1.0", "input_tokens": 2840,
                   "output_tokens": 760, "cost_usd": 0.0085 },
    "dsl_build": { "ok": true, "duration_ms": 12 }
  },
  "total_duration_ms": 4217,
  "total_cost_usd": 0.0085,
  "llm_raw_output": { "...parsed recipe..." }
}
```

Failure results carry the same envelope with whichever stages ran (so observability survives a failed run).

## Business rules

- One vision call per ingest. No retry-with-different-prompt. SDK throw, malformed JSON, or zod failure → `VisionExtractFailed`.
- File-read failure → `FileReadFailed`. The worker still posts the failure via `worker-complete` (BullMQ marks the job done — there is **no** automatic re-run); retry is operator-driven via the inbox Failed tab's Retry button reading `ingest_sources.error_code`.
- MIME restricted to JPEG / PNG / WebP at both API and worker.
- Image size cap 8 MB, enforced at the API: a pre-decode base64-length check rejects oversized payloads before allocating the decoded buffer.
- The screenshot file persists under `${FOOD_INGEST_DIR}/<sourceId>/` (default `./data/food/ingest`); useful for re-ingest/debug. The media tree is unbounded today — no eviction job runs (the FIFO retention sweep is a tracked idea, not built here).
- Cancellation is cooperative: checked before file read and between the vision call and DSL build. Mid-vision-call cancellation is not supported.
- Cost cap is observation-only.
- `partialReason='empty-extraction'` when the parsed recipe has 0 ingredients or 0 steps → draft state `partial`.

## Edge cases

| Case                                    | Behaviour                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Blurry / illegible image                | Vision extracts what it can; near-empty → `partial` / `empty-extraction`.      |
| Multiple recipes (cookbook double-page) | Prompt extracts the first; multiplicity noted in `summary`.                    |
| Not a recipe (e.g. a sunset photo)      | Empty/invalid JSON or near-empty → `partial` / `empty-extraction`.             |
| Non-Latin script                        | Claude transcribes in the source language; user reviews.                       |
| Handwritten, partially illegible        | Uncertain transcription marked in `notes` per prompt.                          |
| 8.1 MB image                            | Rejected at the API; worker never sees it.                                     |
| File missing on disk                    | `FileReadFailed`; surfaced on the Failed tab.                                  |
| MIME doesn't match content              | SDK usually tolerates; otherwise `VisionExtractFailed`.                        |
| Valid JSON, 0 ingredients               | `partial` / `empty-extraction`.                                                |
| Instagram/chat chrome in screenshot     | Vision ignores UI chrome and extracts the recipe; may mention it in `summary`. |

## Acceptance criteria

- [x] `runScreenshotIngest(data, ctx)` in `src/worker/handlers/screenshot.ts`, registered for `kind='screenshot'` in the dispatch registry.
- [x] Reads `data.contentPath` from disk; passes base64 to one Claude vision call; response strict-parsed and zod-validated.
- [x] Prompt + `PROMPT_VERSION_SCREENSHOT` exported from `src/worker/prompts/screenshot.ts`; model overridable via `FOOD_SCREENSHOT_VISION_MODEL`, default `claude-haiku-4-5-20251001`.
- [x] `buildDsl` + `parsedRecipeSchema` produce a grammar-compliant DSL string from the extracted recipe.
- [x] MIME (JPEG/PNG/WebP) and 8 MB cap enforced at the API; pre-decode base64-length guard rejects oversized payloads.
- [x] Producer writes `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` before enqueue; job carries `contentPath` only.
- [x] Meta rollup populated (file_read / vision / dsl_build stages, totals, `llm_raw_output`); `empty-extraction` partial reason derived from empty ingredients/steps.
- [x] Cancellation checked before file read and before DSL build.
- [x] Telemetry reported to the `ai` pillar via `@pops/ai-telemetry` with `operation='recipe-extract-screenshot'`.
- [x] Worker posts result via `POST /ingest/worker-complete`; `FileReadFailed`/`VisionExtractFailed` carry meta and route to the Failed tab (no auto-retry).
- [x] Vitest suite `src/worker/handlers/__tests__/screenshot.test.ts` with committed JPEG/PNG/WebP fixtures covers happy path, malformed JSON, empty extraction, file-read failure, and cancellation, mocking the vision client.

## Out of scope (future)

- OCR fallback (Tesseract) — Claude vision handles v1.
- HEIC / AVIF support — JPEG/PNG/WebP only.
- Multi-image ingest (e.g. cookbook photo + handwritten notes together).
- Pre-submit crop UI — uploader sends the full image.
- Cost-cap enforcement — observation only.
- Streaming vision response — full completion only.
