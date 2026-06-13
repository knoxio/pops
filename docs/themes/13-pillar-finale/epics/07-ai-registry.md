# Epic 07: Discovery-based AI tool registry

> Theme: [Pillar finale](../README.md)

## Scope

Same shape as the search registry, applied to AI tool exposure.

Each pillar's manifest declares the AI tools it exposes: `{ name, description, parameters, allowedUris, requiredScopes }`. The AI orchestrator builds the tool list dynamically from the registry on each request. A pillar going down → its tools vanish from the next AI invocation. A new pillar with new tools → automatically discoverable.

Today: AI tools are hand-registered on pops-api. Adding an AI tool requires touching the ai router + the tools file + redeploying pops-api. After this epic: adding an AI tool = updating the pillar's manifest + redeploying that pillar only.

## PRDs

| #   | PRD                            | Summary                                                                                      | Status      |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------- | ----------- |
| 200 | AI tool manifest               | What a pillar declares; parameters schema; URI scopes the tool can act on                    | Partial     |
| 201 | Dynamic tool list construction | AI orchestrator reads registry on each call; tool list reflects live capabilities            | Not started |
| 202 | Tool-call routing              | When the AI invokes a tool, route to the right pillar via the SDK; handle pillar-unavailable | Done        |

## Dependencies

- **Requires:** Epic 02 (registry), Epic 05 (SDK to invoke tools)
- **Unlocks:** Per-pillar AI capabilities; tighter blast radius for AI changes

## Out of Scope

- Where the AI orchestrator runs (pops-api vs. new `pops-ai-api` container) — ADR-029 / Epic 08b decides
- Model selection logic, budget enforcement, usage cache — those stay co-located with the orchestrator wherever it lands
- Multi-model routing (Anthropic vs. OpenAI vs. local) — that's an existing concern, not a Theme 13 problem
