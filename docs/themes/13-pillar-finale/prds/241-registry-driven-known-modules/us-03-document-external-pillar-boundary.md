# US-03: Document the in-repo / external pillar discovery boundary

> PRD: [PRD-241 — Registry-driven `known-modules`](README.md)

## Description

As a future pillar author, I want the docs to spell out where PRD-241's in-repo discovery stops and where the runtime registry takes over for external pillars, so I know which path to pick when adding a pillar in another repo.

## Acceptance Criteria

- [x] The [pillar-isolation audit](../../notes/pillar-isolation-audit.md)'s `### H1 — packages/module-registry/scripts/known-modules.ts hand-curates every pillar` entry gains a status line: **Closed by [PRD-241](../prds/241-registry-driven-known-modules/README.md)**. The "In-flight" reference to PRD-218 stays; PRD-241 is the closer for H1 specifically.
- [x] [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md) gains (or has confirmed already-present) a cross-reference to PRD-241 in the "Related" / "References" section: "PRD-241 covers in-repo discovery for workspace pillars; ADR-027's runtime registry covers external (non-workspace) pillars."
- [x] [PRD-218](../218-module-registry-deprecation/README.md) README acknowledges PRD-241 as a strict predecessor: `module-registry` cannot be retired until its hand-curated `known-modules.ts` is replaced. One sentence in the PRD-218 background or sequencing notes is enough.
- [x] [PRD-233](../233-external-pillar-example-repo/README.md) README explicitly notes the boundary: the Rust example pillar lives in `examples/` (outside the workspace glob), so PRD-241's discovery does not pick it up. The Rust pillar's path is the runtime registry per ADR-027. One sentence or short "Discovery boundary" note in the PRD background.
- [x] The PRD-241 README's `## Out of Scope` and `## Edge Cases` already describe the boundary. US-03 does not duplicate that prose — it makes the audit + ADR-027 + PRD-233 + PRD-218 mutually consistent so a reader landing on any one of them sees the same boundary articulated.
- [x] `pnpm format docs/` is clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Pure docs. No code, no tests. The deliverable is internal consistency across four existing files plus the audit note.
- This US is independent of [US-01](us-01-add-manifest-export-per-pillar.md) and [US-02](us-02-workspace-discovery-build-step.md) — it can land in any order. Most natural is "land first" so the audit + ADR-027 + PRD-218 + PRD-233 references settle before the build cut-over happens, but the deliverable is the same regardless of order.
- The boundary itself is straightforward and worth restating in one place each:
  - **In-repo pillar** → contract package in `packages/`, picked up by PRD-241's discovery walk. Zero extra steps.
  - **External pillar** → registered at runtime via `POPS_PILLARS` + each registered URL's `GET /manifest.json` (ADR-027). The PRD-241 build-time walk does not see it; the runtime registry does.
- If the audit note already lists "In-flight — PRD-218" against H1, replace it with "Closed by PRD-241" (and keep PRD-218 listed against the broader `module-registry` retirement, not against H1 specifically).
