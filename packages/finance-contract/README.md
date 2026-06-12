# @pops/finance-contract

Public contract for the **finance** pillar — types, Zod schemas, tRPC router
type, error discriminants, and OpenAPI snapshot.

Workspace-only. Never published to npm.

## Shape

```
src/
├── index.ts        barrel
├── types/          plain TypeScript entity types (Wishlist, Transaction, …)
├── schemas/        Zod runtime validators matching ./types 1:1
├── router.ts       tRPC router *type* extracted from pops-finance-api (no runtime)
├── errors.ts       discriminated error envelope { kind: 'ok' | 'not-found' | … }
├── manifest.ts     <FinanceContract> structural snapshot for the registry
└── __tests__/      round-trip Zod ↔ TS tests
openapi/
└── finance.openapi.json   generated; committed for iOS Swift codegen
scripts/
└── generate-openapi.ts    runs at build time; emits the JSON above
```

## Rules

- **Zero runtime deps on `@pops/finance-db`.** `finance-db` is a
  devDependency only — used at build time to extract the router type and
  emit OpenAPI. Consumers depend on this package; the lint rule in PRD-156
  enforces that.
- **Types and schemas agree.** `z.infer<typeof XSchema>` must structurally
  equal `X` from `./types`. The round-trip test in `__tests__/schemas.test.ts`
  is the gate.
- **OpenAPI regenerates on every build.** A drift-check job (PRD-154) runs
  the generator and fails if the committed `openapi/finance.openapi.json`
  diverges from a fresh emission.

See [PRD-153](../../docs/themes/13-pillar-finale/prds/153-contract-package-scaffold/README.md)
for the full design.
