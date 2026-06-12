# PRD-200: AI tool manifest

> Epic: [AI registry](../../epics/07-ai-registry.md)

## Overview

Each pillar declares the AI tools it exposes via its contract's `ai.tools` array. Tools are documented with name, description, parameters, and allowed URI scopes — enough for the AI orchestrator (PRD-201) to build a dynamic tool list per request without hardcoded knowledge.

## Data Model

Extends PRD-157's manifest schema:

```ts
ai: {
  tools: readonly {
    name: string;
    description: string;
    parameters: object;          // JSON Schema for parameters
    allowedUriTypes?: readonly string[];  // optional: which URIs this tool acts on
    requiredScopes?: readonly string[];   // service-account scopes
  }[];
}
```

## API Surface

Contract's `src/ai.ts` declares the tools array; manifest auto-regenerates.

## Business Rules

- **Tool names are pillar-scoped.** Convention: `<pillar>.<tool>`, e.g. `finance.categorize`.
- **Parameters use JSON Schema.** Compatible with most AI orchestration libraries.
- **Allowed URI types restrict tool to specific URI prefixes.** E.g. `finance.categorize` only acts on `pops:finance/transaction/<id>`.
- **Adding a tool = update contract = semver minor bump** (additive).

## Edge Cases

| Case                                                             | Behaviour                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Tool name collision across pillars                               | Pillar prefix prevents; if missing, contract semver CI catches. |
| Tool refers to a URI type not declared in contract's `uri.types` | Cross-field validator (PRD-157) fails.                          |

## User Stories

| #   | Story                                               | Summary                                                 |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| 01  | [us-01-schema-extension](us-01-schema-extension.md) | Extend manifest with tool fields                        |
| 02  | [us-02-finance-pilot](us-02-finance-pilot.md)       | Populate finance contract: categorize, revise, etc.     |
| 03  | [us-03-other-pillars](us-03-other-pillars.md)       | Roll out to media (movie recs), cerebrum (engram synth) |

## Out of Scope

- Tool implementation (lives on the pillar).
- Tool versioning beyond contract semver.
- Cross-tool dependencies.
