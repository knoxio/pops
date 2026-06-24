# Budget insights: alerts, forecasting, dashboard spend

Forward-looking extensions to the budgets feature. The core (CRUD + MTD/YTD spend aggregation + remaining + progress bar on the budgets page) is shipped; these build on top of it.

## Budget alerts / notifications

When spend crosses a threshold of a budget's target (e.g. 80%, 100%), raise a signal. No alert/notification mechanism exists today — `spent`/`remaining` are computed and displayed, but nothing fires.

- Configurable threshold per budget (or a global default).
- Delivery via the pillar's outbound channel (cross-pillar nudge / notification), not just an in-app badge.
- Idempotent: a budget should not re-alert every read; track last-alerted state per period window.

## Spend forecasting

Project end-of-period spend from month-to-date / year-to-date run rate so a budget can show "on track to exceed by Xd" before it actually does. Nothing forecasts today; the UI only reports realized MTD/YTD spend.

- Linear run-rate (MTD / days-elapsed × days-in-period) as a first cut.
- Surface projected overage in the progress column or as a secondary indicator.

## Dashboard cards with spend/progress

The dashboard `ActiveBudgets` cards currently show only target amount and period. The list response already carries `spent` and `remaining`, so the cards could show a progress bar / spent-vs-target without new API work.

- Add a compact progress indicator to each `BudgetCard`.
- Highlight over-budget cards (reuse the destructive treatment from the table's Spent badge).
