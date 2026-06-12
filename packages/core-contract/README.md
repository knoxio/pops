# @pops/core-contract

Public contract for the **core** pillar — types, Zod schemas, tRPC router
type, error discriminants, and a generated OpenAPI snapshot.

Workspace-only. Never published to npm.

## Shape

```
src/
├── index.ts        barrel
├── types/          plain TypeScript entity types (RegistryEntry, …)
├── schemas/        Zod runtime validators matching ./types 1:1
├── router.ts       tRPC router *type* extracted from pops-core-api (no runtime)
├── errors.ts       discriminated error envelope { kind: 'ok' | 'not-found' | … }
├── manifest.ts     <CoreContract> structural snapshot for the registry
└── __tests__/      round-trip Zod ↔ TS tests
openapi/
└── core.openapi.json   generated; committed for iOS Swift codegen
scripts/
├── generate-manifest.ts manifest type generator (PRD-155)
├── verify-manifest.ts   drift check for the committed manifest
├── render-manifest.ts   shared render helper
└── generate-openapi.ts  emits the OpenAPI snapshot from Zod schemas
```

## Pilot entity

The current snapshot ships a single `RegistryEntry` entity as a deliberate
stub — just enough to anchor the round-trip tests and exercise the manifest

- OpenAPI generators. The shape is intentionally minimal (`pillarId`,
  `baseUrl`, `registeredAt`) and does **not** mirror the full live registry
  domain types from `apps/pops-core-api/src/modules/registry/types.ts`
  (which include nested `ManifestPayload` + discriminated heartbeat
  unions). Pulling the full shape across the contract boundary would force
  a runtime dependency on `@pops/pillar-sdk`, which violates the
  "contract has no runtime dependencies on pillar packages" rule. The
  full surface migration is follow-up work (PRD-153 US-07-style content
  migration for core).

## Rules

- **Zero runtime deps on `@pops/core-db`.** `core-db` is not a
  dependency of this package; the router type is extracted from
  `@pops/core-api` (dev-only). Consumers depend on this package.
- **Types and schemas agree.** `z.infer<typeof XSchema>` must structurally
  equal `X` from `./types`. The round-trip test in `__tests__/schemas.test.ts`
  is the gate.
- **OpenAPI regenerates on every build.** `scripts/generate-openapi.ts`
  runs as part of `pnpm build`. The committed `openapi/core.openapi.json`
  is consumed by iOS Swift codegen.

See [PRD-153](../../docs/themes/13-pillar-finale/prds/153-contract-package-scaffold/README.md)
for the full design.
