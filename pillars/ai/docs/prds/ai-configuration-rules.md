# PRD: AI Configuration & Rules

> Status: Partial — the cache-management page and `ai.*` settings are owned here; categorisation rules and prompt viewing live in the finance pillar.

## Purpose

Scope the AI Ops app's configuration surface. Only two things are owned by this pillar: the **cache-management page** and the pillar's **`ai.*` settings** (model defaults, per-pipeline overrides, monthly budget, log retention). Everything else the original "AI configuration" concept covered — the categorisation rules browser and the prompt-template viewer — belongs to the finance pillar, and the AI Ops app simply redirects to it.

## Cache Management (owned here, UI only)

The `/ai/cache` page shows the AI entity-cache stats and lets the operator prune or clear it. The cache itself (`ai_entity_cache.json`) is **finance-categorizer state**, so the data lives on the finance pillar; this page is a transport client over finance's cache endpoints.

| Method | Path (finance pillar)   | Returns / Effect                                                   |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/ai-usage/cache`       | `{ totalEntries, diskSizeBytes }`                                  |
| POST   | `/ai-usage/cache/prune` | `{ removed }` — drops entries older than `maxAgeDays` (default 30) |
| DELETE | `/ai-usage/cache`       | `{ removed }` — clears the whole cache                             |

## Settings (owned here)

The pillar serves its own `ai.*` keys (`settings.*` RU + reset over the `settings` table in `ai.db`). The Settings shell renders these from the pillar's `ai.config` manifest; there is no bespoke config page in the AI Ops app — `/ai/config` redirects to `/settings#ai.config`.

| Key                         | Type   | Purpose                                                                |
| --------------------------- | ------ | ---------------------------------------------------------------------- |
| `ai.model`                  | select | Default model for operations that do not specify their own             |
| `ai.modelOverrides.*`       | text   | Per-pipeline model overrides (Cerebrum query/emit/classifier/etc.)     |
| `ai.monthlyTokenBudget`     | number | Legacy monthly token budget (migrated into an `ai_budgets` global row) |
| `ai.budgetExceededFallback` | select | Legacy `skip`/`alert` behaviour (maps to budget `block`/`warn`)        |
| `ai.logRetentionDays`       | number | Raw `ai_inference_log` retention horizon (default 90)                  |

## Out of Scope — owned by the finance pillar

The categorisation-rules browser and the prompt-template viewer are **not** part of this pillar. The AI Ops app redirects to finance:

- `/ai/rules → /finance/rules` — the corrections/rules management view.
- `/ai/prompts → /finance/prompts` — the read-only prompt-template viewer.

See `../../../finance/docs/` for those specs. This PRD deliberately authors no rules or prompt content.

## Acceptance Criteria

- [x] `/ai/cache` shows cache stats (entry count, on-disk size) and an empty state when the cache is empty.
- [x] A "clear stale" action prunes entries older than a configurable day count and toasts the removed count.
- [x] A "clear all" action purges the cache and toasts the removed count; stats refresh after either action.
- [x] The pillar serves RU + reset over its declared `ai.*` keys from `ai.db`, with the key set derived from the `ai.config` manifest (no hand-listed enum).
- [x] `/ai/config` redirects to `/settings#ai.config`; `/ai/rules` and `/ai/prompts` redirect into the finance pillar.
- [ ] Categorisation-rules browser and prompt-template viewer — not in this pillar; tracked under finance.
