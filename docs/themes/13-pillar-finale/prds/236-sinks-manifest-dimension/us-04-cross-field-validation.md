# US-04: Cross-field manifest validation for sinks

> PRD: [Sinks as a first-class manifest dimension](README.md)

## Description

As a release engineer, I want manifest validation to catch sink misconfigurations at boot time so that a pillar that declares an unreachable event type or duplicates an existing one fails fast instead of silently dropping events at runtime.

## Acceptance Criteria

- [ ] `validateManifestPayload` reports an issue when two sink descriptors in the same manifest declare the same `eventType` (duplicate within one manifest is always a bug).
- [ ] Cross-pillar duplicates are NOT reported by this validator — the registry surfaces them instead, because the validator only sees one manifest at a time.
- [ ] A `checkSinkEventTypesAreUnique` checker function is exported from `@pops/pillar-sdk/manifest-schema`, matching the existing checker shape.
- [ ] Tests cover: duplicate `eventType` within a single manifest, unique `eventType`s within a single manifest, empty descriptors array (no false positive).
- [ ] PRD-236 status moves from `In progress` to `Done` once this US lands.

## Notes

This US is intentionally split out of US-01 because the cross-field validator pattern (already used by `checkContractPackageMatchesPillar`, `checkAiToolAllowedUriTypesAreDeclared`, etc.) lives in `validate.ts` rather than `schema.ts`. Following the same split keeps the file size and concerns aligned with the rest of the manifest validator.

Cross-pillar duplicate-event-type detection is intentionally NOT in scope here — the validator operates on one manifest at a time. The registry layer (PRD-161) is the only component that sees the full federation and is the natural place to detect cross-pillar duplicates.
