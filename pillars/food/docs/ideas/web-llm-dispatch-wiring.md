# Wire the web-LLM fallback into the live `url-web` dispatch

The web-LLM fallback pipeline (`processWithLlm`: readability → Claude → DSL, with telemetry, strict validation, and a 27-case test suite) is fully built but unreachable from production. The `url-web` handler `runWebUrlIngest` in `src/worker/handlers/web-url.ts` still returns a `JsonLdMissing` failure on a JSON-LD miss:

```
errorCode: 'JsonLdMissing',
errorMessage: 'Page has no schema.org Recipe JSON-LD; LLM fallback (PRD-128) not yet wired.',
```

Nothing outside the test file imports `processWithLlm`. Build this to close the loop.

## What to build

- On a JSON-LD miss (the `extraction.tag === 'missing'` branch), call `processWithLlm(fetched.html, data, fetched.finalUrl)` instead of returning `JsonLdMissing`. Keep returning the JSON-LD result on a hit, and keep `JsonLdParseError` for a malformed JSON-LD node (the LLM path is only for _absence_, not corruption — though "fall through to LLM on parse error too" is worth weighing).
- Decide meta merging: today the JSON-LD path and the LLM path each build their own `IngestMeta` with different `extractor_version` strings (`web-jsonld@1` vs `pops-worker-food/web-llm@0.1.0`). The wired handler should carry the `fetch` + `jsonld_extract` stages already recorded into the meta that `processWithLlm` returns, so the review queue sees the full stage trace, not just the LLM half.
- Thread the cancellation context through (the fetch-then-LLM handler should honour the same `ctx.isCancelled()` checkpoints the LLM module already exposes).
- Confirm the worker-shell completion path treats `partialReason='empty-extraction'` from the LLM branch identically to the JSON-LD branch (atomic recipe create + `ingest_sources` update; `state='partial'`).

## Live LLM e2e test (deferred)

The PRD originally specified one end-to-end test with a real Claude call, gated on `RUN_LIVE_LLM_TESTS=1` and skipped in CI. It does not exist — every current test mocks the Anthropic client. Add it once the dispatch is wired, so the gate exercises the real fetch → readability → live model → DSL flow against a known JSON-LD-free fixture URL.

## Out of scope (still deferred, originally PRD-128 non-goals)

- Site-specific extractors (custom prompt per site).
- Hard cost-cap enforcement (abort on overrun) — observation only today.
- Retry-with-different-prompt.
- Multi-language translation (extract in source language; user reviews).
- Streaming completions.
- Self-hosted / non-Claude provider abstraction.
