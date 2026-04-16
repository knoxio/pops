# US-03: Graduation Logic

> PRD: [PRD-086: Trust Graduation](README.md)

## Description

As the Cerebrum system, I need a per-action-type state machine that tracks approval and rejection rates and automatically graduates or demotes action types between trust phases so that Glia earns autonomy incrementally based on demonstrated reliability.

## Acceptance Criteria

- [ ] A `GliaTrustMachine` evaluates phase transitions for each action type after every `decideAction` or `revertAction` call — transitions are checked eagerly, not on a schedule
- [ ] `propose → act_report` transition fires when `approved_count >= 20` AND the rejection rate (`rejected_count / (approved_count + rejected_count)`) is below 10% — both thresholds are configurable in `glia.toml` under `[trust.graduation]`
- [ ] `act_report → silent` transition fires when the action type has been in `act_report` phase for at least 60 days (configurable) AND `reverted_count` is 0 during that period
- [ ] Automatic demotion: any action type is reset to `propose` phase when 2 or more reverts occur within any rolling 7-day window — the window is calculated from `glia_actions` rows with `status: reverted` and `reverted_at` within the last 7 days
- [ ] On demotion, `approved_count`, `rejected_count`, and `reverted_count` are reset to 0, `autonomous_since` is cleared, and `graduated_at` is set to the demotion timestamp with a log entry explaining the demotion trigger
- [ ] On graduation, `graduated_at` is set to the transition timestamp, and for `propose → act_report` the `autonomous_since` field is set — a structured log entry records the transition with the action type, old phase, new phase, and triggering stats
- [ ] Graduation thresholds are read from `engrams/.config/glia.toml` at evaluation time (not cached at startup) so that user edits take effect on the next evaluation without restart
- [ ] Lowering graduation thresholds does not cause retroactive graduation — the transition only fires when triggered by a new user decision or revert event

## Notes

- The state machine is intentionally simple — three phases, two forward transitions, one backward transition. No complex branching or conditional paths.
- The rolling 7-day window for demotion should use actual `reverted_at` timestamps from `glia_actions`, not a sliding window counter, to handle edge cases like clock skew or batch reverts.
- Graduation evaluation is synchronous and fast — it reads counts from `glia_trust_state` and timestamps from `glia_actions` (indexed). It should not block the action service.
- Consider emitting a structured event on phase transitions so other parts of the system (e.g., Reflex, Moltbot) can react to graduation or demotion.
