# ADR-021: Glia Trust Graduation for Autonomous Curation

## Status

Accepted

## Context

Cerebrum's Glia workers (pruner, consolidator, linker, auditor) perform curation actions that modify or archive user content. Consolidating 20 research notes into 2 curated documents creates real value, but also risks losing nuance or destroying content the user cared about. Fully autonomous curation is the goal — a review queue that requires constant user intervention violates the Output > Input principle. But trust must be earned, not assumed.

## Options Considered

| Option                    | Pros                                                                   | Cons                                                                         |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Always autonomous         | Zero friction, Output > Input from day one                             | Destroys trust on first bad consolidation, no recovery path                  |
| Always review queue       | Safe, user always in control                                           | Creates Input > Output — user must review every proposal, adoption-killing   |
| Trust graduation (phased) | Earns trust incrementally, reduces friction over time, per-action-type | More complex to implement, needs approval tracking and graduation thresholds |
| User-configured autonomy  | User sets policy per action type ("auto" vs "review")                  | Requires upfront configuration, user doesn't know what to trust yet          |

## Decision

Three-phase trust graduation, tracked per action type. Each Glia action type (prune, consolidate, link, reclassify) graduates independently based on user approval history.

### Phase 1 — Propose

Glia proposes actions via a lightweight review queue (visible in the pops shell and optionally forwarded to Moltbot). The user approves, rejects, or modifies each proposal. Every decision is logged.

### Phase 2 — Act + Report

After N approved actions of a given type with fewer than M rejections, Glia graduates to autonomous execution for that action type. It acts immediately and sends a digest (daily or per-batch) of what it did. The user can review the digest and revert any action.

### Phase 3 — Silent

After sustained autonomous operation with no reverts for a configurable period, Glia stops sending digests for that action type. Actions are logged but not actively reported. The user checks the audit log only when curious.

### Graduation Thresholds (defaults, configurable)

| Transition        | Requirement                                |
| ----------------- | ------------------------------------------ |
| Phase 1 → Phase 2 | 20 approved actions, <10% rejection rate   |
| Phase 2 → Phase 3 | 60 days of autonomous operation, 0 reverts |
| Any → Phase 1     | 2 reverts in any 7-day window (demotion)   |

### Safety Rails

- No action is irreversible — archived engrams are moved to `engrams/.archive/`, not deleted
- Every Glia action is logged with timestamp, action type, affected engrams, rationale, and phase
- Demotion is automatic — reverts trigger a return to the Propose phase for that action type
- Scope boundaries are always respected — Glia never consolidates across top-level scopes regardless of trust level

## Consequences

- Glia ships in Phase 1 (Propose) for all action types — no autonomous behaviour on first install
- The review queue is a first-class UI component, not an afterthought — it must be low-friction to approve/reject
- Approval tracking adds a `glia_actions` table to SQLite with status, timestamps, and user decisions
- Graduation thresholds are stored in `engrams/.config/glia.toml` and adjustable by the user
- The digest reporting mechanism reuses the existing notification patterns (shell notifications, Moltbot)
- Demotion provides a safety net — a single bad batch of consolidations returns Glia to supervised mode
- Over time, Glia becomes fully autonomous for well-understood action types while remaining supervised for newer or riskier ones
