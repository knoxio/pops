# Instagram STT + Vision — extensions

Forward-looking work split out of the `instagram-stt-vision` PRD. The pipeline ships and is unit-tested; these are the deliberately-deferred bits.

## Gated real-reel integration test

The current test suite mocks every subprocess (yt-dlp, faster-whisper, ffmpeg) and the Anthropic client. There is no test that drives the full pipeline against a real, known-public reel end-to-end. Add an opt-in (env-gated, skipped in CI by default) integration test that downloads a stable public reel, runs real STT + keyframes + a real vision call, and asserts the produced DSL parses and contains plausible ingredients/steps. Cost and flakiness are why it must stay gated.

## De-dupe local schema / DSL / text-fallback prompt

Three artifacts are currently local copies inside `src/worker/handlers/instagram/`, carried until a shared text-ingest helper exists:

- `extracted-recipe.ts` (`extractedRecipeSchema`) duplicates the web/text-ingest LLM output schema.
- `build-dsl.ts` duplicates the `ExtractedRecipe → DSL` assembly used by other ingest paths.
- `text-fallback.ts` re-implements a text-ingest prompt (`web-llm-v1.0`) inline instead of importing a shared `extractWithClaudeText` helper.

When a canonical text-ingest module lands, replace these with imports so there is one schema, one DSL builder, and one text-ingest prompt across all ingest paths. The instagram text-fallback should then differ only by its telemetry operation name (`recipe-extract-ig-text-fallback`), not by a forked prompt body.
