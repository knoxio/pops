# ADR-025: Theme 07-food — Inline Acceptance Criteria

## Status

Accepted — 2026-06-07

## Context

`docs/CLAUDE.md` (the documentation standard) specifies "The Ticket Rule": every implementation traces back to testable acceptance criteria, and the criteria can live in EITHER:

1. **User Story files** (`us-NN-slug.md`) — one file per buildable unit, parallelisable across agents.
2. **Inline in the PRD** under `## Acceptance Criteria` — when the PRD is narrow enough to be a single buildable unit.

The default convention across themes 00-06 is the User Story pattern. Theme 07-food deviates: PRDs carry their acceptance criteria inline, with no `us-NN-*.md` files.

This ADR records the deviation and its rationale so other themes can decide whether to adopt or diverge.

## Options Considered

| Option                                  | Pros                                                                                                                                                        | Cons                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Story files (standard)**         | One file = one parallelisable unit of work; AI agents can pick up a single US without reading the full PRD; matches existing tooling                        | Creates 3-7 extra files per PRD; the file-explosion can drown the directory tree; PRDs and USs duplicate content (PRD context + US criteria) |
| **Inline acceptance criteria (chosen)** | Fewer files; AC lives next to the spec that produces it; granular PRD split substitutes for granular US split (a 7-PRD epic = 7 buildable units regardless) | Each PRD must be narrow enough to be ONE buildable unit; no native parallelisation hints inside a PRD; one PRD = one agent's work-cycle      |
| **Hybrid (some PRDs inline, some US)**  | Pragmatic; lets each PRD choose                                                                                                                             | Inconsistency across the theme; harder for tooling to enumerate "what can I work on next?"                                                   |

## Decision

Theme 07-food adopts the **inline acceptance criteria** pattern uniformly. Every PRD in the theme follows the same convention:

- The PRD has an `## Acceptance Criteria` section near the end.
- The first line of that section reads `Inline per theme protocol.` so a cold-read confirms the choice.
- Criteria are organised into subsections (`### Schema`, `### Service layer`, `### Routes`, `### Tests`, etc.).
- The PRD itself is the buildable unit. When a PRD exceeds ~3 pages, it gets split into multiple PRDs rather than into a PRD + USs.

The theme README's `## Key Decisions` table records this protocol choice in a row labelled "Doc protocol".

## Consequences

**Positive:**

- 47 PRDs × ~5 USs each = 235 files NOT created. The theme directory has 47 PRD READMEs + 8 epic READMEs + 1 theme README = a navigable 56 files instead of ~290.
- Acceptance criteria live next to the API + schema + business rules that produce them. A cold-read implementer doesn't switch files.
- PRDs ARE more granular: PRD-115 (DSL resolver), PRD-116 (DSL materialiser), PRD-117 (cycle detection) are three sibling PRDs of what could have been one larger PRD with three USs. The granularity is the same; the file count is lower.

**Negative:**

- Tooling that enumerates "what work can I pick up?" needs to read every PRD's AC section instead of glob-matching `us-*.md`. v1 tooling for this doesn't exist yet; not a blocker.
- Parallelisation hints (which AC items can be built independently) live in the AC subsection headings rather than as separate files. The reader infers parallelism from the section structure.
- Existing theme conventions (00-06) use USs. New contributors switching between themes have to adapt.

**Revisitable:**

This is a theme-local choice. Future themes can use USs (and most existing ones do). If theme 07-food grows past the point where one PRD = one buildable unit, individual PRDs can be re-split or augmented with USs without affecting the rest of the theme.

## Cross-cutting consequences

- All theme 07-food PRDs (47 of them: PRDs 106-152) follow this convention.
- The theme README's Key Decisions table documents the override.
- `docs/CLAUDE.md` already supports the dual-pattern; this ADR specifies which side of the dual theme 07-food chose.
- Themes 00-06 are unaffected; they continue with the US pattern.
