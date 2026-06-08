# PRD-131: Screenshot Ingest

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Take a single image (recipe screenshot, photo of a cookbook page, photo of a handwritten note, etc.) and extract a recipe via Claude vision. Smallest ingest path — one vision call, one DSL build, one compile. No yt-dlp, no STT, no ffmpeg. The image arrives via the API's base64 payload (PRD-125) and is written to `${FOOD_INGEST_DIR}/<sourceId>/screenshot.<ext>` before enqueue.

## Pipeline

```ts
// apps/pops-worker-food/src/handlers/screenshot.ts
export async function runScreenshotIngest(
  data: IngestJobData & { kind: 'screenshot' },
): Promise<IngestJobResult> {
  // 1. Verify file exists
  const imagePath = data.contentPath;          // already written by PRD-125 producer
  const buffer = await fs.readFile(imagePath);

  // 2. Vision extraction
  const parsed = await extractWithClaudeVision({
    image: { mimeType: data.mimeType, base64: buffer.toString('base64') },
  });
  if (!parsed) return { ok: false, errorCode: 'VisionExtractFailed', ... };

  // 3. Build DSL and hand off to worker shell
  const dsl = buildDsl(parsed, { source: 'screenshot' });
  const partialReason = (parsed.ingredients.length === 0 || parsed.steps.length === 0) ? 'empty-extraction' : undefined;
  return { ok: true, dsl, meta, partialReason };
}
```

## Claude vision call

One image, no other inputs. Same model as PRD-130 (`claude-haiku-4-5-20251001` default, `FOOD_SCREENSHOT_VISION_MODEL` env override).

Prompt:

```
You are extracting a recipe from a single image. The image may be a screenshot of a recipe website, a photo of a cookbook page, a photo of a handwritten note, or a screenshot of a recipe shared in a chat app.

Read all text in the image carefully, including any overlays, handwritten annotations, or printed captions.

Extract a recipe as JSON. Use this exact schema:

(... same schema as PRD-128 ...)

Rules:
- If the image is a cookbook page, the layout typically separates ingredients (often in a sidebar or above the steps) from instructions. Preserve the structure.
- If the image is a handwritten note, transcribe what you can read; mark uncertain text in notes.
- If the image contains multiple recipes, extract ONLY the first one and note "Multiple recipes detected; extracting first" in summary.
- Use metric units when both are listed. Drop imperial parentheticals.
- Output ONLY the JSON. No markdown, no explanation.
```

Prompt as TS constant in `apps/pops-worker-food/src/prompts/screenshot.ts` with `PROMPT_VERSION_SCREENSHOT`. Surfaced at `/food/prompts` (PRD-133).

Token budget: input ~2000-4000 tokens (one image), output ~500-1500. Cost on Haiku 4.5 with vision: ~$0.01-0.02 per ingest.

## Meta JSON additions

```json
{
  "stages": {
    "file_read": { "ok": true, "duration_ms": 5, "bytes": 580000 },
    "vision": {
      "ok": true,
      "duration_ms": 4200,
      "model": "claude-haiku-4-5-20251001",
      "prompt_version": "screenshot-v1.0",
      "input_tokens": 2840,
      "output_tokens": 760,
      "cost_usd": 0.0085
    },
    "dsl_build": { "ok": true, "duration_ms": 12 },
    "compile": { "ok": true, "duration_ms": 90, "creations": 4, "proposedSlugs": 1 }
  }
}
```

## Business Rules

- Single vision call per ingest. No retry-with-different-prompt; if the call fails or returns invalid JSON, the ingest fails with `VisionExtractFailed`.
- Response parsing is strict JSON.parse; zod-validated.
- Image accepted: JPEG, PNG, WebP (matches PRD-125's API validation and PRD-124's hero image cap).
- Image size cap: 8 MB at the API layer (PRD-125). Worker assumes the file on disk is within limits.
- The screenshot file persists in `${FOOD_INGEST_DIR}/<sourceId>/` for the retention window (PRD-110). Useful for re-ingest with a new prompt or debugging.
- Cancellation checked before file read and before vision call. Mid-vision-call cancellation NOT supported.
- Cost cap: observation only (same as PRDs 128, 130).
- If the image is corrupted or unreadable, file-read fails with `FileReadFailed`; BullMQ retries (could be a transient FS issue).

## Edge Cases

| Case                                                                        | Behaviour                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image is blurry / illegible                                                 | Vision extracts what it can; result may be poor. Draft created with state=`partial`, `partialReason='empty-extraction'` if it returns near-empty. |
| Image contains 5 recipes (cookbook double-page)                             | Prompt instructs LLM to extract first; summary mentions multiplicity.                                                                             |
| Image is not a recipe at all (a sunset photo)                               | Vision returns empty/invalid JSON or near-empty extraction → `partial` with `empty-extraction`.                                                   |
| Image is text-heavy but in a non-Latin script                               | Claude vision handles many scripts; transcribes in source language. User reviews.                                                                 |
| Image is handwritten and partially illegible                                | Vision marks uncertain transcription in `notes` field per prompt.                                                                                 |
| Image is 8.1 MB                                                             | Rejected by PRD-125's API; worker never sees it.                                                                                                  |
| Image file missing on disk (deleted between enqueue and process)            | `FileReadFailed`; BullMQ retries.                                                                                                                 |
| Image MIME type doesn't match file content (e.g. PNG content with .jpg ext) | sharp / claude-sdk usually tolerates; if not, treat as `FileReadFailed`.                                                                          |
| LLM returns valid JSON but 0 ingredients                                    | Draft state=`partial`, `partialReason='empty-extraction'`.                                                                                        |
| LLM API rate-limited                                                        | BullMQ retries.                                                                                                                                   |
| Image has watermark / chrome (Instagram share UI captured)                  | Vision usually ignores chrome and extracts the recipe content. May include UI text in summary.                                                    |

## Acceptance Criteria

Inline per theme protocol.

### Pipeline

- [ ] `runScreenshotIngest(data)` exported from `apps/pops-worker-food/src/handlers/screenshot.ts`.
- [ ] Reads `data.contentPath` from disk; passes base64 to Claude vision.
- [ ] Single vision call per ingest.
- [ ] Response strict-parsed and zod-validated.

### Prompt

- [ ] Prompt template exported from `apps/pops-worker-food/src/prompts/screenshot.ts` with `PROMPT_VERSION_SCREENSHOT`.
- [ ] Model configurable via `FOOD_SCREENSHOT_VISION_MODEL`; default `claude-haiku-4-5-20251001`.

### DSL build

- [ ] Reuses `buildDsl(parsed, opts)` from PRD-128 (same schema → same builder).
- [ ] Generated DSL compiles cleanly against PRD-116.

### Meta & logging

- [ ] Meta JSON populated per the shape above.
- [ ] `ai_inference_log` row per PRD-133 with `operation='recipe-extract-screenshot'`.

### Tests

- [ ] Vitest suite at `apps/pops-worker-food/src/handlers/__tests__/screenshot.test.ts` covers happy path + error states.
- [ ] Fixture images committed under `apps/pops-worker-food/src/handlers/__tests__/fixtures/screenshots/` (small, copyright-safe samples).
- [ ] Mocked Claude vision returns canonical JSON, malformed JSON, empty extraction; each asserts the right outcome.

## Out of Scope

- OCR fallback (Tesseract) — Claude vision handles everything in v1.
- HEIC / AVIF support — JPEG/PNG/WebP only per PRD-125.
- Multi-image ingest (e.g. cookbook-page photo + handwritten notes side-by-side) — single image only in v1.
- Image cropping UI before submit — uploader sends the full image.
- Cost-cap enforcement — observation only.
- Comparison with text-LLM fallback when vision fails — screenshot path doesn't have a text alternative.
- Streaming vision response — full completion only.
