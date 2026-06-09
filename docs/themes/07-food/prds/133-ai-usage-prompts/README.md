# PRD-133: AI Usage Logging & Prompt Viewer

> Epic: [02 — Ingestion Pipeline](../../epics/02-ingestion-pipeline.md)

## Overview

Two related cross-cutting concerns for Epic 02's LLM calls:

1. **AI usage logging.** Every Claude API call from the worker writes a row to the existing `ai_inference_log` table (declared in `apps/pops-api/src/db/schema.ts` for theme 05 AI Operations). Food rows use `domain='food'` and operation strings specific to each ingest path. PRD-133 specifies the helper API the worker uses and the row contents.

2. **Prompt viewer.** A read-only page at `/food/prompts` shows every prompt the food pipeline uses, with metadata (model, prompt version, description). Mirrors `packages/app-finance/src/pages/PromptViewerPage.tsx`. Lets the user inspect and discuss prompts without opening the repo.

No new tables. Builds on theme 05's existing AI Operations module.

## AI Usage Logging

### Helper API

```ts
// packages/app-food/src/ai/log-inference.ts (also usable from the worker via api callback)
export async function logFoodInference(input: LogFoodInferenceInput): Promise<void>;

export type LogFoodInferenceInput = {
  operation: FoodOperation; // see enum below
  contextId: string; // typically `ingest_source:${sourceId}`
  provider: 'claude'; // food only uses Anthropic in v1
  model: string; // e.g. 'claude-haiku-4-5-20251001'
  promptVersion: string; // e.g. 'web-llm-v1.0'
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  cached: boolean; // food doesn't cache in v1; always false
  errorMessage?: string;
  metadata?: Record<string, unknown>; // free-form; merged into ai_inference_log.metadata JSON
};

export type FoodOperation =
  | 'recipe-extract-web-llm' // PRD-128
  | 'recipe-extract-ig-vision' // PRD-130 (primary vision call)
  | 'recipe-extract-ig-text-fallback' // PRD-130 (text-LLM fallback when vision fails)
  | 'recipe-extract-screenshot' // PRD-131
  | 'recipe-extract-text'; // PRD-132
```

The worker calls back to pops-api via an internal mutation `food.ai.logInference(input)` (auth via `POPS_API_INTERNAL_TOKEN` same as `workerComplete`). The API inserts the row into `ai_inference_log`.

### Row contents

For a food row, the existing `ai_inference_log` columns get:

| Column          | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| `provider`      | `'claude'`                                                          |
| `model`         | e.g. `'claude-haiku-4-5-20251001'`                                  |
| `operation`     | one of `recipe-extract-*` values from `FoodOperation`               |
| `domain`        | `'food'` — filters food calls out of cerebrum / finance views       |
| `input_tokens`  | from Anthropic response                                             |
| `output_tokens` | from Anthropic response                                             |
| `cost_usd`      | computed from token counts + model pricing (per `ai_model_pricing`) |
| `latency_ms`    | wall time from API call start to response                           |
| `status`        | `'success'` or `'error'`                                            |
| `cached`        | always `false` in v1 (food doesn't cache)                           |
| `context_id`    | `'ingest_source:42'` — links back to the originating ingest         |
| `error_message` | populated when `status='error'`                                     |
| `metadata`      | JSON with `prompt_version`, optional per-call extras                |

### Wrapping the Claude SDK call

A small helper wraps every Claude call so logging is automatic:

```ts
export async function callClaudeWithLogging<T>(opts: {
  operation: FoodOperation;
  contextId: string;
  model: string;
  promptVersion: string;
  call: () => Promise<{ response: T; usage: { inputTokens: number; outputTokens: number } }>;
}): Promise<T>;
```

Each ingest handler (PRDs 127-132) uses this wrapper instead of calling the Anthropic SDK directly. Wrapper:

1. Records start time.
2. Awaits `opts.call()`.
3. On success: computes cost from `ai_model_pricing`, calls `logFoodInference` with `status='success'`.
4. On error: catches, calls `logFoodInference` with `status='error'` and `errorMessage`, rethrows.

### Cost computation

Looks up `ai_model_pricing` row for the `(provider, model)` pair. If absent → log cost as 0 and add `cost_missing: true` to metadata; surface in monthly AI ops review.

### Cost-cap observation

If a single Claude call exceeds the per-job cost cap (`FOOD_INGEST_COST_CAP_PER_JOB_USD`, default `0.05` USD; env var exposed in PRD-126's compose), the wrapper sets `metadata.over_cost_cap=true` on the `ai_inference_log` row and emits a console warning. v1 does NOT abort the call. Future enhancement: hard abort with `CostCapExceeded`.

Per-job (sum-across-calls) cap is NOT implemented in v1 — most ingests make a single LLM call, so per-call ≈ per-job. PRD-130's vision + text-fallback path is the only multi-call case; it would log two rows each with their own `over_cost_cap` evaluation.

## Prompt Viewer

### Page

`packages/app-food/src/pages/PromptViewerPage.tsx` mirrors `packages/app-finance/src/pages/PromptViewerPage.tsx`. Renders a list of cards, one per food prompt:

```
┌─────────────────────────────────────────────────────────┐
│ Web URL — LLM Fallback Extraction          [PRD-128]   │
│ Model: claude-haiku-4-5-20251001                       │
│ Prompt version: web-llm-v1.0                            │
│ Used when JSON-LD is absent on a recipe page.          │
│ ───────────────────────────────────────────────────────│
│ (prompt template, pre-formatted, monospace, scrollable) │
└─────────────────────────────────────────────────────────┘
```

Route: `/food/prompts` (added to `packages/app-food/src/routes.tsx`).

Source: the page imports the prompt-template constants from `packages/app-food/src/ai/prompt-registry.ts`, which re-exports the prompts from each handler's prompt file:

```ts
// packages/app-food/src/ai/prompt-registry.ts
import { PROMPT_WEB_LLM, PROMPT_VERSION_WEB_LLM } from '../prompts/web-llm';
import { PROMPT_IG_VISION, PROMPT_VERSION_IG_VISION } from '../prompts/ig-vision';
import { PROMPT_SCREENSHOT, PROMPT_VERSION_SCREENSHOT } from '../prompts/screenshot';
import { PROMPT_TEXT, PROMPT_VERSION_TEXT } from '../prompts/text';

export const FOOD_PROMPTS = [
  {
    id: 'web-llm',
    title: 'Web URL — LLM Fallback Extraction',
    description: 'Used when JSON-LD is absent on a recipe page.',
    prd: 'PRD-128',
    model: 'claude-haiku-4-5-20251001 (default; configurable via FOOD_WEB_LLM_MODEL)',
    version: PROMPT_VERSION_WEB_LLM,
    template: PROMPT_WEB_LLM,
  },
  // ... ig-vision, screenshot, text
] as const;
```

### Nav

Add a secondary nav entry under `/food`:

```
Food
  ├ Recipes      (PRD-119)
  ├ Manage data  (PRD-122)
  ├ Prompts      (PRD-133) ← new
  ├ Review queue (Epic 03)
  └ ...
```

`/food/prompts` is operator-facing, not a daily-driver surface. Useful when iterating on ingest quality.

### Editability

v1 is read-only. The page header explicitly says: "Prompts are defined in code and cannot be edited here. To change a prompt: edit the relevant TS constant in `packages/app-food/src/prompts/`, bump the version, deploy."

Future PRD could promote prompts to DB rows + editable UI; the page architecture supports the swap (registry-driven).

## Business Rules

- `logFoodInference` is **fire-and-forget from the worker's perspective** — failure to log does NOT fail the ingest. The wrapper catches log errors, surfaces them as console warnings, and continues. We don't want logging issues to block recipe ingestion.
- Every Claude call in PRDs 127-132 MUST use the `callClaudeWithLogging` wrapper. Tests in each handler verify the wrapper was called.
- `cost_usd=0` rows are valid; flagged in monthly review.
- `context_id` format `'ingest_source:<id>'` is deliberately namespaced so future operations (e.g. recipe quality re-analysis) can use different prefixes.
- `metadata.prompt_version` is the bridge between an `ai_inference_log` row and the prompt viewer — the viewer's `version` field matches what got logged.
- The prompt viewer page mirrors finance's read-only pattern exactly. Don't invent new affordances.

## Edge Cases

| Case                                                                  | Behaviour                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic SDK returns success but no usage data                       | Log row with `inputTokens=0, outputTokens=0, cost_usd=0`; add `usage_missing: true` to metadata.                                              |
| `ai_model_pricing` lookup misses (new model not in table)             | Cost logged as 0; warning in metadata; flagged in AI ops monthly review.                                                                      |
| `food.ai.logInference` mutation fails (DB or network)                 | Worker logs a console warning; continues. Ingest unaffected.                                                                                  |
| Prompt template not registered in `prompt-registry.ts`                | `/food/prompts` doesn't show it. Test: assert all `PROMPT_*` exports are present in the registry.                                             |
| Operator wants to know "what was the prompt for this specific ingest" | `ai_inference_log.metadata.prompt_version` records the version. Combined with git history of the prompt file, the exact text is reproducible. |
| Two ingests use different prompt versions (e.g. mid-rollout)          | Each logs its own version. The viewer shows the current version only — historic versions reconstructable via git.                             |
| Prompt template is multi-megabyte (unlikely)                          | Browser renders fine in a `<pre>`. No size limit imposed.                                                                                     |

## Acceptance Criteria

Inline per theme protocol.

### Logging helper

- [ ] `packages/app-food/src/ai/log-inference.ts` exports `logFoodInference` and `callClaudeWithLogging` per the API above.
- [ ] `food.ai.logInference` tRPC mutation accepts the `LogFoodInferenceInput` and writes to `ai_inference_log`.
- [ ] Mutation auth'd via `POPS_API_INTERNAL_TOKEN` (same as `workerComplete`).
- [ ] Each handler in PRDs 127-132 uses `callClaudeWithLogging` for every Claude API call.
- [ ] Vitest test: a mocked Claude call routed through the wrapper produces a log row with all fields populated correctly.

### Cost computation

- [ ] Wrapper looks up `ai_model_pricing(provider, model)`; computes cost from token counts.
- [ ] Missing pricing → logs cost=0 with `cost_missing` flag in metadata.

### Prompt registry

- [ ] `packages/app-food/src/ai/prompt-registry.ts` exports `FOOD_PROMPTS` array.
- [ ] Each entry contains `id`, `title`, `description`, `prd`, `model`, `version`, `template`.
- [ ] Vitest test asserts every `PROMPT_VERSION_*` constant from `packages/app-food/src/prompts/` is present in the registry.

### Prompt viewer page

- [ ] `packages/app-food/src/pages/PromptViewerPage.tsx` exists.
- [ ] Route `/food/prompts` mounted in `packages/app-food/src/routes.tsx`.
- [ ] Page renders each entry in `FOOD_PROMPTS` with title, model, version, description, template.
- [ ] Header explains the read-only nature and where to edit (file path).
- [ ] Storybook story at `packages/app-food/src/pages/PromptViewerPage.stories.tsx`. Storybook discovers stories from `packages/*/src/**/*.stories.@(ts|tsx)`, so the story lives next to the page (matching `DslEditor.stories.tsx` / `RecipeRenderer.stories.tsx`).

### Tests

- [ ] Vitest suite at `packages/app-food/src/ai/__tests__/log-inference.test.ts` covers `callClaudeWithLogging` happy path, error path, missing-usage path, missing-pricing path.
- [ ] Vitest + RTL test for `PromptViewerPage`.
- [ ] Integration test: each ingest handler (PRDs 127-132) mocks Claude and asserts the wrapper was invoked.

## Out of Scope

- Editable prompts (DB-backed) — read-only in v1.
- A/B testing prompts — single template per operation.
- Per-cost-cap aborts — observation only (matches PRDs 128, 130, 131, 132).
- AI usage charts specific to food — theme 05 already has cross-domain views; food rows surface there via `domain='food'`.
- Prompt diffing across versions — git is the source.
- Prompt search / full-text find across templates — viewer is small enough; no search needed.
- Caching of LLM responses for repeat inputs — none in v1; `cached` always false.
- Provider abstraction (DeepSeek, OpenAI) — Claude only for food in v1.
