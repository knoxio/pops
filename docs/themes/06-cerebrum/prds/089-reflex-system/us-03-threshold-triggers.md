# US-03: Threshold Triggers

> PRD: [PRD-089: Reflex System](README.md)
> Status: Done

## Description

As the Cerebrum system, I need threshold-based triggers that fire reflexes when knowledge base metrics cross configured values so that curation actions are triggered automatically when conditions warrant attention.

## Acceptance Criteria

- [x] A threshold evaluator runs periodically (configurable interval, default every 30 minutes) as a BullMQ repeatable job, checking all enabled threshold-triggered reflexes
- [x] Supported metrics: `similar_count` (queries Thalamus for clusters of engrams above a similarity threshold — value is the minimum cluster size), `staleness_max` (queries the highest staleness score across all active engrams — value is the staleness threshold), `topic_frequency` (counts engrams tagged with any single topic — value is the minimum count to trigger)
- [x] The optional `scopes` array restricts metric evaluation to engrams within those scope prefixes — e.g., `scopes = ["work.*"]` only evaluates work-scoped engrams
- [x] Threshold triggers are edge-detected, not level-detected: a threshold that has been crossed fires once per evaluation cycle, then is suppressed until the metric drops below the threshold and crosses again. A `last_triggered_value` field in the execution log prevents duplicate firings
- [x] When a threshold is crossed, the reflex's action is dispatched with context about which metric, what value triggered it, and which engrams are involved (if applicable — e.g., `similar_count` includes the cluster engram IDs)
- [x] Each reflex execution creates a `reflex_executions` row with `trigger_type: 'threshold'`, the metric name and current value in `trigger_data`, and the action outcome in `result`
- [x] Threshold evaluation failures (Thalamus unavailable, query timeout) log an error and skip the current cycle — the threshold is re-evaluated on the next cycle
- [x] Metrics are computed by querying existing services — threshold triggers do not maintain their own data stores

## Notes

- Edge detection is important to prevent the same reflex from firing every 30 minutes while a metric stays above threshold. The simplest implementation: store the last trigger timestamp per reflex and suppress re-firing for a configurable cooldown period (default 24 hours).
- The `similar_count` metric is the most expensive to evaluate — it requires scanning for clusters via Thalamus similarity search. Consider running this metric at a lower frequency (e.g., every 6 hours) or making the interval per-metric configurable.
- Threshold triggers are less reactive than event triggers but more efficient — they batch-evaluate conditions rather than responding to every individual event.
- The evaluation interval should be configurable in `glia.toml` under `[reflexes.thresholds]` — 30 minutes is a reasonable default that balances responsiveness with resource usage.
