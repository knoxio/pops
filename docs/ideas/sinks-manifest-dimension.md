# Sinks manifest dimension — deferred work

Follow-on to the shipped [sinks PRD](../themes/federation/prds/sinks-manifest-dimension/README.md). The schema field, orchestrator `publishEvent` dispatcher, and server `createSinkHandler` helper are built and tested. The items below are not.

## Cross-field uniqueness validator (US-04)

`validateManifestPayload` runs cross-field checkers (`checkContractPackageMatchesPillar`, `checkContractTagMatchesVersion`, `checkAiToolAllowedUriTypesAreDeclared`, `checkSearchAdapterProceduresAreDeclared`) after the strict Zod parse. There is no equivalent checker for sinks, so a manifest can declare two descriptors with the same `eventType` and pass validation.

Add a `checkSinkEventTypesAreUnique` checker in `manifest-schema/validate.ts`, wire it into `validateManifestPayload`'s cross-field list, and export it from `@pops/pillar-sdk/manifest-schema`, matching the existing checker shape.

### Acceptance criteria

- [ ] `validateManifestPayload` reports an issue when two sink descriptors in the same manifest declare the same `eventType` (duplicate within one manifest is always a bug).
- [ ] Cross-pillar duplicates are NOT reported by this validator — the validator only sees one manifest at a time. The registry (which sees the full federation) is the natural place to surface cross-pillar duplicates.
- [ ] `checkSinkEventTypesAreUnique` is exported from `@pops/pillar-sdk/manifest-schema`, matching the existing checker shape.
- [ ] Tests cover: duplicate `eventType` within a single manifest, unique `eventType`s within a single manifest, empty descriptors array (no false positive).

The cross-field validator pattern lives in `validate.ts` rather than `schema.ts`; keeping the same split keeps file size and concerns aligned with the rest of the manifest validator.

## No production publisher or subscriber yet

The dispatcher and handler helper exist in the SDK, but no pillar calls `publishEvent`, mounts a `/_sinks/<eventType>` route, or registers a `sinks` block in its live manifest. The scaffold is inert until a real consumer arrives. The first two consumers are tracked separately:

- [HA bridge pillar](ha-bridge-pillar.md) — declares outbound sinks and subscribes to POPS events.
- [pops → HA event publisher](pops-to-ha-event-publisher.md) — wires the first real publisher (e.g. finance low-balance → HA automation).

Wiring those is also where the in-process runtime Zod schema registry (the `schemas` map injected into `publishEvent`) gets its first production population and where the authenticated HTTP `poster` is bound to the server transport.
