# PRD-199: Partial failure semantics

> Epic: [Search registry](../../epics/06-search-registry.md)

## Overview

How federated search surfaces "I got 4/5 pillar responses; here are partial results." Provides explicit hints to the UI so users see "(some sources offline)" instead of a misleading complete-empty result.

## Data Model

No persistent data.

## API Surface

```ts
type SearchResponse = {
  results: ScoredResult[];
  partial: {
    requestedPillars: string[];
    respondedPillars: string[];
    failedPillars: { pillar: string; reason: string }[];
    timeoutPillars: string[];
  };
};
```

## Business Rules

- **Every response includes `partial` block.** Even if all pillars responded successfully (failed/timeout arrays empty).
- **UI surfaces "X of Y sources" indicator** when failed/timeout arrays are non-empty.
- **Adapter failures include error message + class** for debugging.

## Edge Cases

| Case                | Behaviour                                                            |
| ------------------- | -------------------------------------------------------------------- |
| All pillars succeed | `partial.failed = [], partial.timeout = []`; UI shows nothing extra. |
| All pillars fail    | `results: []` + full `failedPillars` list; UI shows error state.     |

## User Stories

| #   | Story                                                                       | Summary                                | Status      |
| --- | --------------------------------------------------------------------------- | -------------------------------------- | ----------- |
| 01  | [us-01-response-shape](us-01-response-shape.md)                             | Add partial block to search response   | Done        |
| 02  | [us-02-orchestrator-tracks-failures](us-02-orchestrator-tracks-failures.md) | Orchestrator collects failure info     | Done        |
| 03  | [us-03-shell-ui-indicator](us-03-shell-ui-indicator.md)                     | Shell shows "X of Y sources" indicator | Not started |

## Out of Scope

- Per-result confidence scoring.
- Retry of failed pillars.
- Long-poll for delayed responses.
