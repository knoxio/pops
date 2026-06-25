# Manifest schema validator — deferred slices

Companion to [PRD manifest-schema-validator](../themes/federation/prds/manifest-schema-validator.md).
The schema, validator, both-ends integration, and per-field error reporting are
all built and shipped. Two slices from the original plan were never built — they
are not blocking, because the per-pillar manifest test suites already gate a
malformed manifest at PR time and the both-ends runtime validation catches the
rest.

## 1. Standalone `validate:manifest <pillar>` CLI

A `pnpm validate:manifest <pillar>` command that runs `validateManifestPayload`
against a pillar's `build<Pillar>Manifest()` output and prints the per-field
report.

- **What exists today:** each pillar's
  `pillars/<id>/src/api/__tests__/manifest.test.ts` asserts its
  `build<Pillar>Manifest()` output passes both `ManifestPayloadSchema.parse` and
  `validateManifestPayload`. A malformed manifest therefore fails that pillar's
  vitest suite in CI before deploy.
- **Gap:** there is no single command a contract author can run by hand to get
  the formatted issue list without writing/running a test. The test suite is the
  guard; the ergonomic CLI is the missing nicety.
- **Sketch:** a small `scripts/validate-manifest.mjs` that dynamically imports the
  named pillar's built `build<Pillar>Manifest`, calls `validateManifestPayload`,
  and pretty-prints `issues` (or exits 0). Wire it as a `package.json` script.
  Could iterate all pillars when invoked with `--all`, mirroring
  `scripts/check-pillar-schema-coverage.mjs`.

## 2. Schema-evolution runbook

A written runbook for evolving the manifest schema — semver discipline,
coordinated SDK + registry bumps, the compatibility window, and the rollout order
when tightening a regex or adding a required field.

- **What exists today:** the policy is captured as business rules in the PRD
  (schema version = SDK version; both ends pin SDK versions; the legacy dotted
  `/core.registry.register` alias absorbs SDK skew during rollout). The mechanics
  are real and enforced; the step-by-step runbook is not written.
- **Gap:** no `docs/runbooks/` entry walking an author through a coordinated
  schema change (bump SDK → rebuild every pillar → roll the registry last, or
  vice versa, with the compatibility window made explicit).
- **Worth writing when:** the schema next changes in a way that breaks an older
  pillar's manifest — the first real coordinated rollout is the moment to capture
  the procedure.
