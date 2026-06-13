# US-02: Decide and execute the publication target

> PRD: [Cross-language SDK wire-format spec](README.md)

## Description

As a maintainer needing to point external pillar authors at the wire-format spec, I want `wire-format-spec.md` published at a stable, discoverable URL so that I can link to it from ADR-033, the README, the registry's docs, and external repos without breaking when internal directory layouts change.

## Acceptance Criteria

- [ ] A short trade-off note exists at the top of this US's PR describing the two candidates: (a) ship as a deliverable inside `@pops/pillar-sdk` so it travels with the contract package, or (b) ship as a standalone `pops-wire-format` repo so it can be referenced without npm-installing the SDK.
- [ ] One option is chosen with a one-paragraph justification. Default lean: (a) — co-location with the SDK keeps the spec, the conformance suite (US-03), and the reference TS implementation in lock-step. (b) is justified if and only if a concrete external consumer needs to reference the spec without depending on the SDK.
- [ ] The spec is published at the chosen target with stable internal anchor links (`#single-call-procedure`, `#batched-procedure`, etc.) so future docs can deep-link.
- [ ] ADR-033's `Related` section is updated to link directly to `wire-format-spec.md` at the chosen URL (currently it only references "PRD-231" by number).
- [ ] The theme README's `## References` and Epic 14's `## Dependencies` are updated to reference the spec at the chosen URL.
- [ ] If option (a) is chosen: a top-level `WIRE-FORMAT.md` or equivalent visible-from-the-repo-root pointer exists so engineers browsing the GitHub repo find the spec without spelunking through `packages/pillar-sdk/docs/`.
- [ ] If option (b) is chosen: the standalone repo is initialised with a README pointing at POPS, a license, and the spec doc itself. CI is set up to validate links inside the spec.

## Notes

Avoid publishing the spec at two URLs. If it ends up in both a package and a docs site, one becomes stale within a release cycle. Single source of truth, mirrored _only_ via automated build steps (not by hand).

The publication target is load-bearing because [ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md) names PRD-231 as the canonical wire-format spec. Anyone implementing a non-TS pillar follows that reference chain — make sure the destination is stable for years.
