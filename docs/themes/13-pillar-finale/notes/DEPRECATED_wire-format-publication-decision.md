# Wire-format publication target — decision note

> **DEPRECATED — superseded.** The `pillar-wire-format-v1` spec, the
> `packages/wire-conformance/` suite, and the Rust reference pillar this note
> planned for have all been dropped: the lake is REST-only and no live pillar
> speaks the `/trpc` wire format. Retained for history only; nothing below is
> current.

> PRD: 231 — Cross-language SDK wire-format spec (superseded)
> US: us-02-publication-target (superseded)
> Spec: `pillar-wire-format-v1.md` (deleted)
> Snapshot date: 2026-06-13

## Decision

**Keep the spec in this monorepo as the single source of truth at
`docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md`, and add a
thin root-level pointer file (`WIRE-FORMAT.md`) that links to it.** Do
not extract a standalone `pops-wire-format` repo at this time.

This is option (a) from the PRD with a small refinement: the spec does
not move into `packages/pillar-sdk/` because that package is
`private: true` and never publishes to npm — co-locating the spec there
buys nothing and hurts discoverability for non-TS implementers browsing
GitHub.

## Options considered

### (a) Ship inside / alongside `@pops/pillar-sdk`

The PRD's default lean. The spec, the conformance suite (US-03), and
the reference TS implementation all live in the same package, version
together, and rev in lock-step.

| Pro                                                                                    | Con                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec, SDK, and conformance suite move together — no skew possible.                     | `@pops/pillar-sdk` is `private: true`. There is no npm publish today. External implementers cannot `npm install` it; co-location buys them nothing. |
| One PR touches all three when wire-format and SDK behaviour change.                    | Pillar SDK rev cadence is high (every behaviour tweak); spec should be stable. Versioning gets noisy if they share a semver.                        |
| Conformance suite is already at `packages/wire-conformance/` — same monorepo, same CI. | Spec buried under `packages/pillar-sdk/docs/` is hard to find from the GitHub root.                                                                 |
| Existing precedent inside POPS: every other contract artifact lives in the workspace.  | —                                                                                                                                                   |

### (b) Standalone repo `knoxio/pops-wire-format`

A dedicated repository with versioned releases, its own CI, and a
README pointing back at POPS.

| Pro                                                                                                   | Con                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-language reach: a Rust/Go/Python engineer clones a markdown repo, not a TS SDK.                 | No concrete external consumer exists today. A second repo solves a problem nobody has yet.                                                                                                                            |
| Independent semver. The spec revs only when the wire format itself revs.                              | Two-repo sync overhead. ADR-033, the SDK, and the conformance suite all reference the spec by URL — any move breaks links unless redirects exist.                                                                     |
| Precedent: Protocol Buffers (`protocolbuffers/protobuf`), gRPC, OpenAPI all ship as standalone specs. | The conformance suite still needs the spec checked in to the POPS monorepo (or vendored) so SDK PRs can update spec + code + tests atomically. Duplication risk — exactly what the PRD's Notes section warns against. |
| Discoverability via GitHub topics / search for "pops wire format".                                    | CI for a second repo to maintain (link validation, markdown lint). Low effort but non-zero.                                                                                                                           |

## Why (a) wins for now

1. **No external consumer exists.** PRD-231 ships the spec so engineers
   _can_ write non-TS pillars; PRD-233 is the first such pillar and is
   not on the runway. Until a concrete out-of-tree implementer asks for
   a standalone repo, optimising for that case is speculative.
2. **The pillar-sdk is `private: true`.** "Ship alongside the SDK"
   doesn't mean "publish as part of the npm package" — there is no npm
   package. It means "live in the same workspace as the conformance
   suite and the reference TS impl", which is already true of the
   `docs/` location.
3. **Discoverability is solved by a root pointer, not by repo
   topology.** An external engineer hitting `github.com/knoxio/pops`
   sees `WIRE-FORMAT.md` at the root and clicks through. That's the
   same number of hops as a standalone repo and avoids cross-repo sync.
4. **The PRD's "avoid two URLs" rule.** Publishing in both a standalone
   repo and the monorepo (for SDK PRs to land atomic spec changes)
   guarantees skew within a release cycle. Single source of truth in
   the monorepo eliminates the failure mode entirely.
5. **Update cadence concern is over-stated.** The wire format is
   versioned via `X-Pops-Wire-Version` and the spec ships as `v1`. The
   SDK's frequent revs don't touch the spec unless they change
   normative wire behaviour — and when they do, a single-PR atomic
   change across spec + SDK + conformance suite is the desired flow.

## Follow-up actions

- [ ] Create `WIRE-FORMAT.md` at the repo root containing a one-line
      pointer to `docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md`
      and the permalink on `main`. (US-02 implementation step.)
- [ ] Update ADR-033's `Related` section to link directly to the spec
      path (not just "PRD-231"). (US-02 implementation step.)
- [ ] Update the theme README's `## References` and Epic 14's
      `## Dependencies` to point at the spec path. (US-02 implementation
      step.)
- [ ] Verify all spec section anchors (`#single-call-procedure`,
      `#batched-procedure`, `#manifest-endpoint`, etc.) match the
      headings in `pillar-wire-format-v1.md` so deep-links work.
- [ ] Revisit this decision when the first non-TS pillar lands
      (PRD-233 or later). If that engineer's feedback is "I'd prefer a
      standalone repo", extract then — the spec is one file and a redirect
      shim in the monorepo is cheap.

## Explicitly rejected

- Publishing the spec at both a standalone repo and the monorepo. The
  PRD's `## Notes` section bans this. One source of truth, mirrored
  only via automated build steps.
- Putting the spec inside `packages/pillar-sdk/docs/`. The SDK is
  private; the spec is normative for non-TS consumers; burying it
  three directories deep under a TS package hurts the people the spec
  is for.
