# US-07: Alert Rules & Notification Delivery

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want configurable alert rules that fire when AI budgets approach their limits, error rates spike, or latency degrades so that I am notified promptly and can take corrective action before issues impact the system.

## Acceptance Criteria

- [ ] `ai_alert_rules` Drizzle schema exists with columns: `id` (serial PK), `type` (enum: `budget-threshold` | `error-spike` | `latency-degradation`), `scope_provider` (text, nullable — filter to specific provider), `scope_model` (text, nullable — filter to specific model), `threshold_value` (numeric, NOT NULL — percentage for budget/error, milliseconds for latency), `window_minutes` (integer, nullable — rolling window for error-spike, default 60), `enabled` (boolean, default true), `created_at`, `updated_at`
- [ ] `ai_alerts` Drizzle schema exists with columns: `id` (serial PK), `rule_id` (FK → ai_alert_rules), `type` (text, NOT NULL), `message` (text, NOT NULL), `severity` (enum: `warning` | `critical`), `scope_detail` (text, nullable — e.g., "provider:claude" or "model:claude-haiku-4-5-20251001"), `metric_value` (numeric — the actual value that triggered the alert), `threshold_value` (numeric — the threshold from the rule), `acknowledged` (boolean, default false), `acknowledged_at` (timestamp, nullable), `created_at` (timestamp, NOT NULL)
- [ ] Default alert rules are seeded: budget-threshold at 80%, error-spike at 10% in a 60-minute window, latency-degradation at 10000ms
- [ ] **Budget-threshold** alert: fires when current month spend reaches `threshold_value`% of any `ai_budgets` cost or token limit. Severity is `warning` at 80%, `critical` at 95%.
- [ ] **Error-spike** alert: fires when the error rate (status `error` or `timeout` / total calls) within the last `window_minutes` exceeds `threshold_value`%. Scoped to provider/model if specified.
- [ ] **Latency-degradation** alert: fires when the P95 latency for a model in the last `window_minutes` exceeds `threshold_value` ms. Scoped to specific model if specified, otherwise evaluated per-model.
- [ ] Alert deduplication: for a given `(type, scope_detail)` combination, at most one alert is created per hour. Subsequent triggers within the same hour are suppressed.
- [ ] Alert delivery — **Shell notification**: active (unacknowledged) alerts are surfaced via an in-app badge or toast in the POPS UI, using the same notification mechanism as other POPS alerts
- [ ] Alert delivery — **Moltbot (Telegram)**: if Moltbot integration is configured, critical alerts are sent via Telegram using the same delivery channel as Cerebrum proactive nudges (PRD-084). Warning alerts are not sent to Telegram unless explicitly configured.
- [ ] `core.aiAlerts.list` endpoint: returns alerts filterable by `acknowledged` (boolean), `type`, `severity`, `startDate`, `endDate`. Ordered by `created_at` descending. Paginated.
- [ ] `core.aiAlerts.acknowledge` endpoint: accepts an alert `id`, sets `acknowledged=true` and `acknowledged_at=now()`. Returns the updated alert.
- [ ] Alert rules are configurable via the monitoring dashboard (US-06): a simple form allows creating, editing, enabling/disabling, and deleting rules
- [ ] A BullMQ repeatable job (`ai-alert-evaluator`) runs every 5 minutes: iterates over all enabled `ai_alert_rules`, evaluates each rule's condition against the current data, creates `ai_alerts` rows for any triggered rules (respecting deduplication), and dispatches notifications
- [ ] Unit test: create a budget-threshold rule at 80%, insert inference log rows totaling 81% of a budget limit, run the evaluator job, verify an alert row is created with correct type, message, and metric_value
- [ ] Unit test: create two triggers for the same rule within 1 hour, verify only one alert is created (deduplication)
- [ ] Unit test: acknowledge an alert, verify `acknowledged=true` and `acknowledged_at` is set

## Notes

- The alert evaluator job should be lightweight — it runs every 5 minutes and should complete in under 10 seconds. Use indexed queries and avoid full table scans.
- Deduplication key is `(type, scope_detail)` with a 1-hour window. Check `MAX(created_at)` for matching alerts before inserting.
- For Moltbot delivery, reuse the existing Moltbot client/service rather than creating a new Telegram integration. If Moltbot is not configured, skip Telegram delivery silently.
- Alert messages should be human-readable, e.g., "Budget 'global' is at 85% of its $50.00 monthly cost limit ($42.50 spent)" or "Error rate for claude-haiku-4-5-20251001 spiked to 15.2% in the last 60 minutes (threshold: 10%)".
