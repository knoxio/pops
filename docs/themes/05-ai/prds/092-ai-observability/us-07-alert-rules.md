# US-07: Alert Rules & Notification Delivery

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want configurable alert rules that fire when AI budgets approach their limits, error rates spike, or latency degrades so that I am notified promptly and can take corrective action before issues impact the system.

## Acceptance Criteria

- [x] `ai_alert_rules` Drizzle schema exists with columns: `id` (serial PK), `type` (enum: `budget-threshold` | `error-spike` | `latency-degradation`), `scope_provider` (text, nullable — filter to specific provider), `scope_model` (text, nullable — filter to specific model), `threshold_value` (numeric, NOT NULL — percentage for budget/error, milliseconds for latency), `window_minutes` (integer, nullable — rolling window for error-spike, default 60), `enabled` (boolean, default true), `created_at`, `updated_at`
- [x] `ai_alerts` Drizzle schema exists with columns: `id` (serial PK), `rule_id` (FK → ai_alert_rules), `type` (text, NOT NULL), `message` (text, NOT NULL), `severity` (enum: `warning` | `critical`), `scope_detail` (text, nullable — e.g., "provider:claude" or "model:claude-haiku-4-5-20251001"), `metric_value` (numeric — the actual value that triggered the alert), `threshold_value` (numeric — the threshold from the rule), `acknowledged` (boolean, default false), `acknowledged_at` (timestamp, nullable), `created_at` (timestamp, NOT NULL)
- [x] Default alert rules are seeded: budget-threshold at 80%, error-spike at 10% in a 60-minute window, latency-degradation at 10000ms
- [x] **Budget-threshold** alert: fires when current month spend reaches `threshold_value`% of any `ai_budgets` cost or token limit. Severity is `warning` at 80%, `critical` at 95%.
- [x] **Error-spike** alert: fires when the error rate (status `error` or `timeout` / total calls) within the last `window_minutes` exceeds `threshold_value`%. Scoped to provider/model if specified.
- [x] **Latency-degradation** alert: fires when the P95 latency for a model in the last `window_minutes` exceeds `threshold_value` ms. Scoped to specific model if specified, otherwise evaluated per-model.
- [x] Alert deduplication: for a given `(type, scope_detail)` combination, at most one alert is created per hour. Subsequent triggers within the same hour are suppressed.
- [x] Alert delivery — **Cerebrum nudge channel**: every alert is persisted as an `insight`-type row in `nudge_log` (PRD-084) — `priority=high` for critical, `priority=medium` for warning — so the existing nudge UI surfaces it alongside other proactive nudges. The original alert id/rule id/severity are preserved in `action_params`.
- [x] Alert delivery — **Moltbot (Telegram)**: when `POPS_ALERTS_TELEGRAM_BOT_TOKEN` and `POPS_ALERTS_TELEGRAM_CHAT_ID` are set, critical alerts are pushed to Telegram via the Bot API (`sendMessage`, Markdown). Warning alerts are suppressed unless `POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS=1`. When unset the dispatcher silently no-ops.
- [x] `core.aiAlerts.list` endpoint: returns alerts filterable by `acknowledged` (boolean), `type`, `severity`, `startDate`, `endDate`. Ordered by `created_at` descending. Paginated.
- [x] `core.aiAlerts.acknowledge` endpoint: accepts an alert `id`, sets `acknowledged=true` and `acknowledged_at=now()`. Returns the updated alert.
- [x] Alert rules CRUD via tRPC: `core.aiAlerts.rules.list/get/create/update/delete/setEnabled/seedDefaults`. Dashboard wiring (US-06) tracks the UI form as a follow-up.
- [x] A BullMQ repeatable job (`pops-ai-alerts`, name `aiAlertEvaluation`) runs every 5 minutes on the `pops-default` queue: iterates over all enabled `ai_alert_rules`, evaluates each rule's condition against the current data, creates `ai_alerts` rows for any triggered rules (respecting deduplication), and dispatches notifications via the channel facade.
- [x] Unit test: create a budget-threshold rule at 80%, insert inference log rows totaling 81% of a budget limit, run the evaluator job, verify an alert row is created with correct type, message, and metric_value
- [x] Unit test: create two triggers for the same rule within 1 hour, verify only one alert is created (deduplication)
- [x] Unit test: acknowledge an alert, verify `acknowledged=true` and `acknowledged_at` is set

## Notes

- The alert evaluator job should be lightweight — it runs every 5 minutes and should complete in under 10 seconds. Use indexed queries and avoid full table scans.
- Deduplication key is `(type, scope_detail)` with a 1-hour window. Check `MAX(created_at)` for matching alerts before inserting.
- For Moltbot delivery, reuse the existing Moltbot client/service rather than creating a new Telegram integration. If Moltbot is not configured, skip Telegram delivery silently.
- Alert messages should be human-readable, e.g., "Budget 'global' is at 85% of its $50.00 monthly cost limit ($42.50 spent)" or "Error rate for claude-haiku-4-5-20251001 spiked to 15.2% in the last 60 minutes (threshold: 10%)".
