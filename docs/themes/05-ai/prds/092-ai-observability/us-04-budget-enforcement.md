# US-04: Budget Enforcement

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want the platform to enforce spending limits on AI calls — blocking, warning, or falling back to a cheaper model when a budget is exceeded — so that AI costs remain predictable and controllable.

## Acceptance Criteria

- [ ] Pre-call budget check is integrated into `trackInference()` (US-03): before executing a non-cached AI call, the middleware queries `ai_budgets` for all applicable rules (global, matching provider, matching operation)
- [ ] For each applicable budget, the middleware sums `cost_usd` (for cost limits) or `input_tokens + output_tokens` (for token limits) from `ai_inference_log` for the current calendar month and the relevant scope
- [ ] If any budget with `action='block'` is exceeded: the call is rejected without hitting the provider, a row is logged with `status='budget-blocked'` and `cost_usd=0`, and the function throws a typed `BudgetExceededError` with details about which budget was exceeded
- [ ] If any budget with `action='warn'` is exceeded: a warning is logged (via the application logger), and the call proceeds normally
- [ ] If any budget with `action='fallback'` is exceeded: the middleware attempts to route the call to a local provider (looked up from `ai_providers` where `type='local'` and `status='active'`); if no local provider is available, the call is blocked as with `action='block'`
- [ ] Budget status API — `core.aiObservability.getBudgetStatus`: returns an array of budget objects, each containing `id`, `scope_type`, `scope_value`, `monthly_token_limit`, `monthly_cost_limit`, `action`, `current_token_usage`, `current_cost_usage`, `percentage_used` (of whichever limit is set), and `projected_exhaustion_date` (linear extrapolation: if current spend is X on day D of the month, exhaustion = limit / (X / D) days from month start)
- [ ] Budget CRUD API — `core.aiBudgets.list`: returns all budget rules; `core.aiBudgets.upsert`: creates or updates a budget rule by `id`
- [ ] On application startup, a migration function checks for existing `ai.monthlyTokenBudget` and `ai.budgetExceededFallback` settings: if found and no `ai_budgets` row with `id='global'` exists, it creates one with the appropriate `monthly_token_limit` and `action` (`budgetExceededFallback='skip'` → `'block'`, `'alert'` → `'warn'`, unset or unrecognized → `'warn'`)
- [ ] Budget check queries are efficient: use a single aggregate query per scope rather than loading all log rows
- [ ] Unit test: create a budget with `monthly_cost_limit=1.00` and `action='block'`, insert `ai_inference_log` rows totaling $1.01 for the current month, call `trackInference` with a non-cached call, verify it throws `BudgetExceededError` and a row with `status='budget-blocked'` exists
- [ ] Unit test: create a budget with `action='warn'` that is exceeded, verify the call proceeds and a warning is logged
- [ ] Unit test: verify `getBudgetStatus` returns correct `percentage_used` and a reasonable `projected_exhaustion_date`

## Notes

- Budget enforcement must be fast — the monthly aggregate should be a simple `SUM` with an index on `created_at`. Consider caching the running total in memory and invalidating on each new log row.
- The `projected_exhaustion_date` is purely informational (displayed on the dashboard). It uses linear extrapolation: `exhaustion_day = limit / (current_spend / current_day_of_month)`. If spend is zero, return `null`.
- The fallback mechanism reuses the provider registry (US-01) to find an active local provider. The middleware must swap `provider` and `model` params before executing the fallback call, and log the fallback call as a separate inference log row.
- `BudgetExceededError` should extend a base POPS error class and include `budgetId`, `limitType` ('cost' | 'token'), `currentUsage`, and `limit` fields.
