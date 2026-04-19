# US-03: Inference Middleware

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a developer integrating AI calls throughout POPS, I want a single `trackInference()` wrapper function that instruments any AI call — recording provider, model, operation, domain, tokens, latency, status, and cost — so that all AI usage is automatically observed without duplicating logging logic in every call site.

## Acceptance Criteria

- [x] A `trackInference<T>(params: TrackInferenceParams, fn: () => Promise<T>): Promise<T>` function exists that: starts a timer, executes `fn`, stops the timer, extracts token counts from the result, computes cost from `ai_model_pricing`, inserts a row into `ai_inference_log`, and returns the original result
- [x] `TrackInferenceParams` includes: `provider` (string), `model` (string), `operation` (string), `domain` (string, optional), `contextId` (string, optional), `cached` (boolean, optional — default false)
- [x] When `cached` is true: the row is logged with `cached=true`, `latency_ms=0`, `cost_usd=0`, and token counts are still recorded
- [x] Token extraction for Anthropic SDK: reads `response.usage.input_tokens` and `response.usage.output_tokens` from the `Message` response type
- [ ] Token extraction for local models (Ollama): reads tokens from response if available, otherwise estimates as `Math.ceil(wordCount * 1.3)` for both input and output
- [x] Cost computation: looks up the model's `input_cost_per_mtok` and `output_cost_per_mtok` from `ai_model_pricing` and computes `cost_usd = (input_tokens * input_cost / 1_000_000) + (output_tokens * output_cost / 1_000_000)`
- [x] On error: catches the exception, logs a row with `status='error'` and `error_message` set to the error's message (truncated to 1000 chars), then re-throws the original error
- [x] On timeout (error message contains "timeout" or error is an AbortError): logs with `status='timeout'`
- [x] The `context_id` field is set from the calling context — import batch ID for categorizer calls, conversation ID for Ego calls, job ID for background processing
- [x] Existing Claude calls in `ai-categorizer.ts` (entity matching) are wrapped with `trackInference({ provider: 'claude', model: <configured model>, operation: 'entity-match', domain: 'finance' })`
- [x] Existing Claude calls in `rule-generator.ts` (rule generation) are wrapped with `trackInference({ provider: 'claude', model: <configured model>, operation: 'rule-generation' })`
- [x] Future Cerebrum call sites are documented as TODOs: embedding pipeline (PRD-076, operation: `embedding`), Ego conversations (PRD-087, operation: `conversation`), Glia curation (PRD-085, operation: `curation`)
- [ ] Integration test: mock a Claude API call returning a known token count, invoke `trackInference`, verify a row appears in `ai_inference_log` with correct `provider`, `model`, `operation`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms > 0`, and `status='success'`
- [ ] Integration test: mock a failing Claude API call, invoke `trackInference`, verify a row appears with `status='error'` and `error_message` populated, and the original error is re-thrown

## Notes

- `trackInference` should be generic over the return type so it can wrap any async function without altering the caller's type expectations.
- The pricing lookup should be cached in memory (e.g., a simple Map with a 5-minute TTL) to avoid a DB query on every AI call.
- For the Anthropic SDK, the `Message` type from `@anthropic-ai/sdk` includes `usage: { input_tokens: number; output_tokens: number }` — use this directly rather than parsing raw responses.
- The middleware must not swallow errors — it logs and re-throws so callers retain their existing error handling.
- This middleware is the single point where `ai_inference_log` rows are created. No other code should insert into this table directly.
