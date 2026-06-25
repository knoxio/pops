# Dynamic tool list: unbuilt follow-ups

Spun out of the [Dynamic AI tool list PRD](../themes/federation/prds/dynamic-tool-list.md).
The registry-driven `buildToolList()` projection ships in full; what's below does not.

## Registry-backed `unknown-tool` detection

`invokeTool` (tool-call routing) discriminates its result as
`ok` / `pillar-unavailable` / `tool-error` / `unknown-tool`. The `unknown-tool`
branch fires only when the AI emits a malformed name that does not match
`<pillar>.<tool>`. A _syntactically valid_ name pointing at a tool that no
pillar actually declares does **not** resolve to `unknown-tool` today — it lands
as `tool-error`, either via the local "tool not exposed" guard or via a
`contract-mismatch` bubbled up from the pillar. The router cannot prove
non-existence without consulting the registry.

The follow-up: cross-reference the invoked name against the current
`buildToolList()` (or the same registry snapshot) before dispatch, so a
well-formed name that no live pillar advertises fails closed with `unknown-tool`
instead of being misreported as a tool-level failure. This gives the AI loop a
clean "that tool doesn't exist" signal distinct from "that tool exists but
errored".

Open question to resolve before building: should the check read the same memo
`buildToolList()` produces (cheap, but scoped to the default healthy set), or a
raw snapshot lookup (so a tool on an `unavailable` pillar resolves to
`pillar-unavailable` rather than `unknown-tool`)? The desired discrimination
between "doesn't exist anywhere" and "exists but its pillar is down" decides
which source the lookup hangs off.

## Out of scope (stays out)

- Tool selection / which tool to call — the orchestrator's loop, not the projection.
- Per-conversation tool filtering.
- Provider-specific tool-format conversion.
