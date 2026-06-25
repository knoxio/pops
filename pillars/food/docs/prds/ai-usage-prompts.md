# AI Usage Logging & Prompt Viewer

Status: **Done** — cost-cap observation and explicit `usage_missing` / `cost_missing` metadata flags are not built; see [ideas/ai-usage-cost-cap-and-flags.md](../ideas/ai-usage-cost-cap-and-flags.md).

Two cross-cutting concerns for the food ingest pipeline's Claude calls:

1. **AI usage logging.** Every Claude call from the food worker reports usage/cost/latency/error telemetry to the **ai pillar**, which owns the cross-pillar inference store. Food keeps no local inference-log table or route — it reports through the shared `@pops/ai-telemetry` wrapper, tagging each record `domain='food'`.
2. **Prompt viewer.** A read-only page at `/food/prompts` lists every prompt the pipeline uses, with model + version + description, so prompts can be inspected without opening the repo.

## AI Usage Logging

### Reporting path

Food calls Claude only from its worker. Every call site routes through `callWithLogging` from `@pops/ai-telemetry` (`libs/ai-telemetry`). There is no food-local logging helper, mutation, or route. The wrapper runs the Claude call on the hot path and, fire-and-forget off the hot path, looks up pricing, computes cost, and POSTs an `InferenceRecord` to the ai pillar's internal `POST /ai-usage/record`.

Food's wiring lives in `pillars/food/src/worker/ai/ai-telemetry-deps.ts`:

- `provider = 'anthropic'`, `domain = 'food'`.
- A `httpLookupPricing` adapter pointed at `AI_API_URL` (default `http://ai-api:3008`), memoised per `(provider, model)` so repeated inferences never re-hit `GET /ai-pricing`.
- `report` left unset → `callWithLogging` falls back to the env-driven sink (`createEnvReportSink`).

The sink resolves its base URL from `AI_API_URL` first, then `POPS_API_URL`; token from `POPS_API_INTERNAL_TOKEN` sent as `x-pops-internal-token`. When no base URL resolves (vitest/dev), reporting is a silent no-op. A missing sink, a non-2xx response, or a thrown fetch are all swallowed — telemetry never alters control flow.

### Operations

One operation string per ingest path, set at each worker call site. `contextId`
and `promptVersion` are optional fields on the `callWithLogging` config; the
table records which call sites actually pass each (not every path threads the
source id through to the call site yet):

| Operation                         | Call site                                                     | Prompt           | `contextId` | `promptVersion`    |
| --------------------------------- | ------------------------------------------------------------- | ---------------- | ----------- | ------------------ |
| `recipe-extract-web-llm`          | `worker/handlers/web-llm-extract.ts`                          | web-llm          | ✓           | ✓                  |
| `recipe-extract-ig-vision`        | `worker/handlers/instagram/vision.ts`                         | ig-vision        | —           | ✓                  |
| `recipe-extract-ig-text-fallback` | `worker/handlers/instagram/text-fallback.ts`                  | ig text fallback | —           | ✓ (`web-llm-v1.0`) |
| `recipe-extract-screenshot`       | `worker/ai/anthropic-client.ts` (via `screenshot-extract.ts`) | screenshot       | —           | —                  |
| `recipe-extract-text`             | `worker/handlers/extract-with-claude.ts` (via `text.ts`)      | text             | ✓           | ✓                  |

The Instagram path is the only multi-call case (vision, then text-only fallback when vision fails); it logs one row per call.

### Record contents

Each reported `InferenceRecord` carries:

| Field                          | Value                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `provider`                     | `'anthropic'`                                                                                                  |
| `model`                        | resolved model, e.g. `claude-haiku-4-5-20251001`                                                               |
| `operation`                    | one of the `recipe-extract-*` strings above                                                                    |
| `domain`                       | `'food'` — filters food calls out of other pillars' AI views                                                   |
| `inputTokens` / `outputTokens` | from the Anthropic response usage                                                                              |
| `costUsd`                      | computed from token counts × ai-pillar pricing (`0` on miss)                                                   |
| `latencyMs`                    | wall time from call start to response                                                                          |
| `status`                       | `'success'` or `'error'`                                                                                       |
| `cached`                       | always `false` (food doesn't cache)                                                                            |
| `contextId`                    | `'ingest_source:<sourceId>'` on the paths that thread the source id through (web-llm, text); omitted otherwise |
| `errorMessage`                 | populated when `status='error'`                                                                                |
| `promptVersion`                | the prompt version string of the call (set on every path except screenshot)                                    |

On throw, the wrapper reports a `status='error'` record (tokens 0) with the error message **before** rethrowing.

### Cost computation

`computeCostUsd` prices `inputTokens`/`outputTokens` against the ai pillar's per-million-token pricing returned by the memoised lookup. On a pricing miss it returns `costUsd: 0` with an internal `missing: true` (consumed inside the wrapper; not yet stamped onto the record metadata — see idea).

## Prompt Viewer

`/food/prompts` (`pillars/food/app/src/pages/PromptViewerPage.tsx`, mounted in `app/src/routes.tsx`, nav entry `Prompts` under `/food`). Mirrors finance's read-only `PromptViewerPage`. Renders one card per registry entry: title, owning PRD, model, version, description, and the full template in a scrollable `<pre>`.

The page is registry-driven. `app/src/ai/prompt-registry.ts` exports `FOOD_PROMPTS`, importing the template + version constants from each prompt module under `app/src/prompts/` (`web-llm`, `ig-vision` — both vision and text-fallback variants — `screenshot`, `text`). Each entry: `id`, `title`, `description`, `prd`, `model`, `version`, `template`.

v1 is read-only. The header explains prompts are defined in code; to change one, edit the constant in `app/src/prompts/`, bump its version, deploy. (The app-side prompt modules are the viewer's source; the worker keeps its own copies under `src/worker/prompts/` — the worker is what actually calls Claude. The two copies are maintained by hand and can drift: today the app modules carry `*-v0.1` while the worker constants carry `*-v1.0`, so the viewer's version is a label for the template the operator reads, not a guaranteed match for the `promptVersion` stamped on a logged row.)

## Business Rules

- Reporting is fire-and-forget from the worker's perspective; a failed report never fails the ingest. `@pops/ai-telemetry` swallows sink errors and continues.
- Every Claude call in the ingest handlers goes through `callWithLogging`; food keeps no local logging helper, mutation, or route, and no local `ai_inference_log` table (dropped; a one-shot idempotent backfill in `scripts/backfill-ai-inference.ts` migrated historical rows to the ai pillar, dedupe-keyed `food:ai_inference_log:<id>`).
- `costUsd=0` rows are valid (free or unpriced model).
- `contextId` format `ingest_source:<id>` is deliberately namespaced so future operations can use other prefixes. The wire schema (`@pops/ai-telemetry` `InferenceRecordSchema`) constrains `contextId` to no-whitespace, ≤128 chars (`/^\S+$/`) as a PII guard; food's `ingest_source:<numericId>` always satisfies it.
- `promptVersion` names the template a logged row used. The worker stamps its own `src/worker/prompts/` version (currently `*-v1.0`; the ig-text-fallback path stamps `web-llm-v1.0`); the viewer renders the app-side `app/src/prompts/` version (currently `*-v0.1`). These are hand-maintained copies and can differ, so the viewer is a human-readable catalogue rather than a strict lookup keyed by logged `promptVersion`.
- The viewer shows the current version only; historic versions are reconstructable via git.

## Edge Cases

| Case                                                  | Behaviour                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Anthropic returns success but no usage                | tokens default through the SDK shape; cost computed on whatever counts arrive                      |
| Pricing lookup misses (new model)                     | `costUsd=0`; row still reported                                                                    |
| Telemetry report fails (sink down / non-2xx / thrown) | swallowed; worker continues; ingest unaffected                                                     |
| Prompt not registered in `prompt-registry.ts`         | not shown; drift test fails (every `PROMPT_VERSION_*` under `app/src/prompts/` must be registered) |
| "What prompt produced this ingest?"                   | row's `promptVersion` + git history of the prompt file reproduces the exact text                   |
| Two ingests on different versions mid-rollout         | each logs its own version; viewer shows current only                                               |

## Acceptance Criteria

### Telemetry reporting

- [x] Every food worker Claude call goes through `@pops/ai-telemetry`'s `callWithLogging`; food keeps no local logging helper, mutation, route, or `ai_inference_log` table.
- [x] Reports POST to the ai pillar's internal `POST /ai-usage/record`, auth'd via `x-pops-internal-token` (`POPS_API_INTERNAL_TOKEN`), base URL from `AI_API_URL` then `POPS_API_URL`; silent no-op when unset.
- [x] Each ingest handler (web-llm, ig-vision, ig-text-fallback, screenshot, text) sets its `recipe-extract-*` operation and `domain='food'`. `web-llm` and `text` additionally tag `contextId='ingest_source:<id>'`; `promptVersion` is set on every call except the screenshot path (see table).
- [x] On throw, a `status='error'` record (tokens 0) with the message is reported before rethrow.
- [x] Vitest covers the wrapper (`libs/ai-telemetry/src/__tests__/`) and food's deps/reporting (`src/worker/ai/__tests__/ai-telemetry.test.ts`): happy path, error path, cost computation, missing pricing, `domain='food'`.

### Cost computation

- [x] `computeCostUsd` prices `(provider, model)` per ai-pillar pricing; missing pricing → `costUsd=0`.

### Prompt registry

- [x] `app/src/ai/prompt-registry.ts` exports `FOOD_PROMPTS`; each entry has `id`, `title`, `description`, `prd`, `model`, `version`, `template`.
- [x] Drift test (`app/src/ai/__tests__/prompt-registry.test.ts`) asserts every `PROMPT_VERSION_*` under `app/src/prompts/` is registered, ids unique, versions unique, templates non-empty.

### Prompt viewer page

- [x] `app/src/pages/PromptViewerPage.tsx` exists; route `/food/prompts` mounted in `app/src/routes.tsx`; nav entry present.
- [x] Page renders each `FOOD_PROMPTS` entry (title, PRD, model, version, description, template) with a read-only/where-to-edit header.
- [x] Storybook story (`PromptViewerPage.stories.tsx`) next to the page; RTL test (`app/src/pages/__tests__/PromptViewerPage.test.tsx`).

## Out of Scope

- Editable prompts (DB-backed) — read-only in v1.
- A/B testing prompts — single template per operation.
- Response caching — none; `cached` always false.
- Provider abstraction beyond Anthropic.
- Food-specific AI charts — cross-domain views in the ai pillar surface food rows via `domain='food'`.
