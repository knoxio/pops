# Populate pillar AI tool descriptors

The [AI tool manifest](../themes/federation/prds/ai-tool-manifest/README.md)
contract is fully implemented: the `ai.tools` slot, its `.strict()` descriptor
schema, and the `allowedUriTypes ⊆ uri.types` cross-field validator all ship and
are tested. What does _not_ exist is any pillar that actually declares a tool.
Every manifest in the fleet ships `ai: { tools: [] }`. Until descriptors are
populated, `buildToolList()` correctly returns an empty list and the orchestrator
runs with whatever in-process tools it carries.

This idea captures the work to fill that slot.

## Pilot — finance

Populate the finance contract's `ai.tools` with the first real descriptors so the
end-to-end path (manifest → registry → `buildToolList` → `invokeTool` → pillar
handler) gets exercised with live data rather than test fixtures. Candidate tools:

| Tool name (camelCase) | Acts on               | Notes                                              |
| --------------------- | --------------------- | -------------------------------------------------- |
| `categorize`          | `finance/transaction` | Suggest/apply a category for a transaction URI.    |
| `revise`              | `finance/transaction` | Apply a user correction (feeds the learning loop). |

Each needs: a camelCase `name`, a 10–500 char `description`, a JSON Schema
`parameters` object, `allowedUriTypes` drawn from the pillar's `uri.types`, and a
matching handler exposed on the pillar's REST surface under the convention the
tool-router dispatches against (`aiTools.<name>`).

Acceptance:

- [ ] Finance manifest ships at least one non-empty tool descriptor that passes
      manifest validation (including the `allowedUriTypes ⊆ uri.types` check).
- [ ] The pillar exposes a callable handler for each declared tool.
- [ ] `buildToolList()` returns the finance tools when the pillar is healthy and
      drops them when it is not.
- [ ] `invokeTool('finance.categorize', …)` round-trips to the handler and back.

## Rollout — other pillars

Once finance proves the path, extend to the obvious AI surfaces:

- **media** — movie/show recommendation tools acting on `media/*` URIs.
- **cerebrum** — engram synthesis / recall tools acting on `cerebrum/*` URIs.

Acceptance:

- [ ] At least one additional pillar (media or cerebrum) ships real tool
      descriptors that validate and round-trip end-to-end.

## requiredScopes enforcement

The `requiredScopes` field on a tool descriptor is **format-checked only** today
(each entry must be a dotted settings key). There is no cross-field validation
that the named scope exists, and nothing at invocation time that proves the
caller holds it. To make the field load-bearing:

- [ ] Decide where scopes are defined (a settings/service-account registry) and
      cross-validate each `requiredScopes` entry against it at manifest time, the
      same way `allowedUriTypes` is checked against `uri.types`.
- [ ] Enforce the scope at `invokeTool` time — refuse a tool the caller is not
      scoped for, surfacing it as a distinct `ToolResult` kind rather than a
      generic `tool-error`.

Until then, `requiredScopes` is advisory metadata.
