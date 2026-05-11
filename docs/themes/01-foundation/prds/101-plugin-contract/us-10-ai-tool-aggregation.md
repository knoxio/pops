# US-10: AI tool surface aggregation

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As Ego (or any MCP-speaking client), I want a single source listing every AI-callable tool the installed modules expose so that the available tool set is exactly the installed module set, with no manual registration.

## Acceptance Criteria

- [x] Installed modules declare AI-callable tools in their manifest backend contract.
- [x] The MCP tool-listing surface returns the merged AI tool set drawn from the installed module set.
- [x] Ego uses the same merged tool list as MCP when preparing tool context for model calls.
- [x] Tool exposure is manifest-driven only — no module requires ad-hoc infrastructure registration.
- [x] Tool name uniqueness is enforced when the registry is built; collisions fail the build with both owning module ids named.
- [x] When the deployment is scoped to a single app, the tool-listing surface returns only that app's tools plus core tools; tools from absent modules do not appear.

## Notes

- This US is what makes the AI overlay "collect tools across all apps" from the architectural note real — and removes the need for any module to know about Ego or MCP infrastructure.
- Tool handlers are typed against the module's backend contract; reuse the existing procedure types where possible.
