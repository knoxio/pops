# PRD-201: Dynamic AI tool list

> Epic: [AI registry](../../epics/07-ai-registry.md)

## Overview

The AI orchestrator queries the registry on every request to build the active tool list. Pillars going down → their tools disappear from the next call. Pillars coming up with new tools → automatically available.

## Data Model

No persistent data.

## API Surface

```ts
async function buildToolList(opts?: {
  pillars?: string[]; // optional filter
  includeUnavailable?: boolean; // for testing
}): Promise<Tool[]>;

type Tool = {
  name: string;
  description: string;
  parameters: object;
  pillar: string;
  pillarStatus: 'healthy' | 'unavailable' | 'unknown';
};
```

## Business Rules

- **Tool list rebuilt per AI request.** Caches for 30s; aligned with discovery TTL.
- **Unhealthy pillars excluded by default.** Optional `includeUnavailable` for diagnostics.
- **List includes pillar source** for the orchestrator to route invocations correctly.

## Edge Cases

| Case                 | Behaviour                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| All pillars down     | Empty tool list; AI request still runs with whatever tools are in-process (currently: none after Theme 13). |
| Pillar with no tools | Excluded silently.                                                                                          |

## User Stories

| #   | Story                                       | Summary                                             |
| --- | ------------------------------------------- | --------------------------------------------------- |
| 01  | [us-01-list-builder](us-01-list-builder.md) | Read registry; filter active pillars; flatten tools |
| 02  | [us-02-cache-layer](us-02-cache-layer.md)   | 30s TTL cache                                       |
| 03  | [us-03-tests](us-03-tests.md)               | Test: simulated registry → tool list shape          |

## Out of Scope

- Tool selection logic (orchestrator's job).
- Per-conversation tool filtering.
- AI provider-specific tool format conversion (translates inside orchestrator).
