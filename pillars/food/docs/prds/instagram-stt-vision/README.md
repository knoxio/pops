# Instagram STT + Vision Pipeline

Status: Done — full pipeline shipped (orchestrator, caption heuristic, faster-whisper STT, ffmpeg keyframes, Claude vision, text-LLM fallback, degradation truth table, acquisition-failure conversion, DSL build, per-stage meta, AI telemetry). Only forward work is the gated real-reel integration test and de-duping the local schema/DSL/prompt copies once a shared text-ingest helper exists — both moved to `../../ideas/instagram-stt-vision-extensions.md`.

The slowest path in food ingest. Given a `url-instagram` job, acquire the reel (see `instagram-acquisition`), decide whether the caption is structured enough to skip speech-to-text, run `faster-whisper` on the audio otherwise, pull ffmpeg scene-detection keyframes, hand caption + transcript + keyframes to Claude vision, validate the JSON, fall back to a text-LLM on the caption if vision fails, build a recipe DSL string, and return a structured `IngestJobResult`. The orchestrator never throws — every subprocess and LLM call is wrapped so the result is always a structured job result. The worker shell then hands the result to the ingest worker-complete flow (`ingest-api`), which writes the draft atomically; this pipeline never touches the recipe store directly.

Typical 60s reel: ~30-60s STT (CPU), ~5s keyframes, ~5s vision, ~negligible DSL build.

## Entry point

`runInstagramIngest` is the `IngestHandler<'url-instagram'>` registered in the worker dispatch table (`src/worker/handlers/instagram.ts`). It reads env config (`ANTHROPIC_API_KEY`, optional `FOOD_IG_VISION_MODEL`, optional `FOOD_WHISPER_MODEL`), lazily builds the Anthropic client, and delegates to `runInstagramPipeline` (`src/worker/handlers/instagram/orchestrator.ts`). `PIPELINE_VERSION = 'ig-stt-vision@1'` is the `extractor_version` stamped into meta.

Pipeline order: cancellation check → acquisition → caption heuristic → STT (conditional) → keyframes → vision → text-fallback → DSL build. Cancellation is polled before acquisition, after acquisition, after STT, and after keyframes. Mid-LLM-call cancellation is not supported.

## Stages

### Caption heuristic — `isStructuredCaption(caption)`

Returns true (and so skips STT) when the caption already looks like a parseable recipe. True iff caption length ≥ 100 AND either (≥5 lines starting with a bullet/number AND a measurement-unit token like `g|kg|ml|l|cup|tbsp|tsp|oz|lb`) OR (an `ingredient(s)` header AND a `method|steps|directions|instructions` header). Tuned conservatively: false negatives (needless STT) are cheaper than false positives (missing content).

### faster-whisper STT — `runWhisper`

Spawns `python3 -m faster_whisper.cli --model distil-large-v3 --device cpu --compute_type int8 --output_format vtt --output_dir {workDir} --beam_size 5 --language auto {videoPath}`. Model overridable via `FOOD_WHISPER_MODEL`. Reads the produced `transcript.vtt`, strips the header/timestamps/numeric cue ids, concatenates cues into a flat string. 120s timeout. Non-zero exit, timeout, or missing output raise → STT-failure degradation branch. Skipped entirely when the caption is structured.

### ffmpeg keyframes — `extractKeyframes`

Scene-detection pass `-vf "select='gt(scene,0.3)',scale=720:-2" -vsync vfr -q:v 2 -frames:v 10` → ≤10 720p JPEGs in `{workDir}/keyframes/`. If zero frames result, a single fallback frame is pulled at the 2s mark (`-ss 2 -frames:v 1`). 60s timeout. Failures raise → keyframes-failure branch (vision still runs on caption + transcript).

### Claude vision — `extractWithClaudeVision`

One multimodal `messages.create`: up to **5** keyframes (first 5 by ffmpeg scene-order) as base64 image blocks + the rendered prompt text (caption, transcript, keyframe count). Model default `claude-haiku-4-5-20251001`, overridable via `FOOD_IG_VISION_MODEL`. `max_tokens` 2000. Response: rejects markdown-fenced output, `JSON.parse`, then zod-validate against the shared `extractedRecipeSchema`; any deviation raises. Logged via AI telemetry as operation `recipe-extract-ig-vision`, prompt version `ig-vision-v1.0`.

### Text-LLM fallback — `extractWithTextFallback`

Invoked only when vision failed AND caption length ≥ 30. Single text-only `messages.create` with a self-contained system prompt (its own template, version `web-llm-v1.0`) over the caption; same output schema, same parse/validate rules as vision. Model default `claude-haiku-4-5-20251001`. Logged as operation `recipe-extract-ig-text-fallback` — the distinct operation name is what separates this call's context in observability.

### DSL build — `buildDsl`

Pure `ExtractedRecipe → string`. Slugifies the title to kebab ASCII with `-2/-3/...` collision suffixes against a reserved set. Emits `@recipe(...)` (servings default 4; optional prep_time/cook_time in min, optional summary), `@yield(slug, servings:serving)`, one `@ingredient(idx, descriptor, qty:unit[, notes])` per entry (descriptor = `ingredient[:variant[:prep]]`, prep clamped to a curated set, qty/unit/slug sanitised), one `@step("body"[, duration=:min][, temperature=:c])` per step.

## Acquisition-failure conversion — `convertAcquisitionFailure`

Maps `instagram-acquisition`'s failure variants onto `IngestJobResult`:

| acq.kind            | result                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-dead`         | `ok:true`, `partialReason:'auth-dead'`, placeholder DSL `@recipe(slug="ig-pending-<sourceId>", title="Instagram ingest pending — cookies need refresh", servings=1)` + `@yield`. Surfaces in the review queue so the user sees the cookie-refresh prompt; not retried. |
| `rate-limited`      | `ok:false`, `errorCode:'InstagramRateLimited'`, `retryAfterSec` propagated to the queue.                                                                                                                                                                               |
| `generic-failure`   | `ok:false`, `errorCode:'InstagramAcquisitionFailed'` (yt-dlp exit + truncated stderr).                                                                                                                                                                                 |
| `missing-artifacts` | `ok:false`, `errorCode:'InstagramArtifactsMissing'`.                                                                                                                                                                                                                   |
| `cancelled`         | `ok:false`, `errorCode:'Cancelled'`.                                                                                                                                                                                                                                   |

## Degradation truth table — `derivePartialReason`

| visionOk | captionStructured | transcriptOk | keyframesOk | textFallbackUsed          | partialReason           |
| -------- | ----------------- | ------------ | ----------- | ------------------------- | ----------------------- |
| yes      | yes               | (skipped)    | any         | —                         | none                    |
| yes      | no                | yes          | any         | —                         | none                    |
| yes      | no                | no           | any         | —                         | `stt-failed`            |
| no       | —                 | —            | yes         | yes                       | `vision-failed`         |
| no       | —                 | —            | no          | yes                       | `caption-only-fallback` |
| no       | —                 | —            | —           | no (fallback not reached) | `vision-failed`         |

Vision succeeding short-circuits to `stt-failed`-or-none. When vision fails, the orchestrator runs the text fallback if the caption qualifies; if neither vision nor fallback yields a recipe, the result is `ok:false, errorCode:'AllExtractionPathsFailed'`. `auth-dead` (above) is the only acquisition path that surfaces as a partial success.

## Meta JSON

`meta = { extractor_version, stages }`. Per-stage records the orchestrator writes:
`acquisition` (ok, video_path, thumbnail_path, caption_length / or ok:false+kind), `caption_heuristic` (structured, length), `stt` (ok + duration_ms/model/transcript_chars, or skipped+reason, or ok:false+reason), `keyframes` (ok, duration_ms, count, used_fallback / or ok:false+reason), `vision` (ok, duration_ms, model, prompt_version, keyframes_sent, input_tokens, output_tokens / or ok:false+reason), `text_fallback` (ok + duration_ms/model/operation/prompt_version/tokens, or skipped, or ok:false+reason), `dsl_build` (ok, duration_ms, ingredients, steps).

## Business rules

- Acquisition failure is terminal for the success path — no degradation recovers from rate-limited / generic / missing-artifacts; `auth-dead` is converted to a partial-success placeholder for the review queue.
- STT failure is recoverable (caption + vision still produce a draft) → `partialReason:'stt-failed'`.
- Vision failure with no usable caption is terminal (`AllExtractionPathsFailed`); with a caption it falls through to the text LLM.
- Empty/short caption + STT skipped can't happen: the heuristic's length<100 gate forces STT for empty captions.
- Concurrent invocations are isolated by per-source workdir; memory pressure from concurrent faster-whisper is bounded by worker concurrency.
- `ANTHROPIC_API_KEY` missing → immediate `errorCode:'MissingApiKey'` (no acquisition spend).
- Cost-cap is observation-only (logged, not enforced).

## Edge cases

- Heuristic says structured but caption is junk → vision still runs; review queue catches a bad draft.
- Heuristic false-negative → needless ~45s STT; acceptable.
- Video has no audio → empty transcript, treated as STT success; vision proceeds.
- Very long reel → STT may hit the ingest timeout; operator can raise it.
- Non-English audio → faster-whisper auto-detects; transcript and output may be in the source language; user reviews.
- Vision returns malformed/fenced JSON → vision-failure; degrade to text fallback if caption qualifies, else fail.
- 0 keyframes after fallback → empty image array to vision (caption + transcript only).
- > 5 keyframes → capped at 5 before the vision call.
- Vision API rate-limited → job fails; queue retries per policy.

## Acceptance criteria

Pipeline orchestration

- [x] `runInstagramIngest` registered for `url-instagram`; delegates to `runInstagramPipeline`, which converts acquisition failures and never throws.
- [x] Caption heuristic gates STT per the documented logic.
- [x] STT, keyframes, vision, and text-fallback each wrapped in try/catch; failures route to degradation branches.
- [x] Cancellation polled before/after acquisition, after STT, after keyframes.
- [x] `partialReason` derived from per-stage outcomes per the truth table.
- [x] Missing `ANTHROPIC_API_KEY` short-circuits with `MissingApiKey` before acquisition.

faster-whisper

- [x] `python3 -m faster_whisper.cli` invoked with the documented flags; model overridable via `FOOD_WHISPER_MODEL`.
- [x] `transcript.vtt` parsed (header/timestamps/cue-ids stripped) into a flat string.
- [x] 120s timeout; non-zero exit / timeout / missing output → STT failure.

ffmpeg keyframes

- [x] Scene-detection invocation yields up to 10 720p frames; single-frame 2s fallback when zero.
- [x] 60s timeout; failures → keyframes-failure (vision still runs).

Claude vision

- [x] One multimodal call: caption + transcript + ≤5 keyframes; first 5 selected when more exist.
- [x] Prompt template `IG_VISION_PROMPT` with `PROMPT_VERSION_IG_VISION='ig-vision-v1.0'`; rendered with caption/transcript/keyframe-count placeholders.
- [x] Model configurable via `FOOD_IG_VISION_MODEL`; default `claude-haiku-4-5-20251001`.
- [x] Response fence-rejected, `JSON.parse`d, zod-validated against `extractedRecipeSchema`.

Text-LLM fallback

- [x] Invoked when vision fails AND caption ≥30 chars; otherwise skipped (meta records the skip).
- [x] AI telemetry operation `recipe-extract-ig-text-fallback`, prompt version `web-llm-v1.0`; output schema shared with vision.

Acquisition-failure conversion

- [x] Each acquisition variant mapped to the correct result shape; `auth-dead` → partial-success placeholder DSL; `rate-limited` → `retryAfterSec`.

Meta & logging

- [x] Per-stage meta populated as documented; one AI telemetry row per LLM call (vision + fallback when invoked).

Tests

- [x] Vitest unit tests cover orchestrator happy path + degradation branches, the truth table, caption heuristic, VTT parsing, vision (including the ≤5 keyframe cap), DSL build, acquisition-failure conversion, and the dispatcher wiring. All subprocess and LLM calls mocked.

## Out of scope

- Instagram acquisition / yt-dlp / cookies — `instagram-acquisition`.
- AI-usage logging mechanics and the prompt viewer — `ai-usage-prompts`.
- Hard cost-cap enforcement — observation only.
- GPU faster-whisper, multilingual translation, vision prompt A/B testing, streaming responses, per-creator prompts, audio-only path.
- Gated real-reel integration test; de-duping the local `extractedRecipeSchema`/`buildDsl`/text-fallback prompt with a shared text-ingest helper — see `../../ideas/instagram-stt-vision-extensions.md`.
