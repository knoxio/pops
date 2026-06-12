# @pops/food-contract

Public contract for the **food** pillar — types, Zod schemas, tRPC router
type, error discriminants, and a generated OpenAPI snapshot.

Workspace-only. Never published to npm.

> **Note:** there is also a separate `@pops/food-contracts` (plural)
> package in `packages/food-contracts/` that predates the Theme 13
> contract-package rollout. The two are unrelated; this singular package
> is the canonical contract surface going forward (PRD-153).

## Shape

```
src/
├── index.ts        barrel
├── types/          plain TypeScript entity types (Recipe, …)
├── schemas/        Zod runtime validators matching ./types 1:1
├── router.ts       tRPC router *type* extracted from pops-food-api (no runtime)
├── errors.ts       discriminated error envelope { kind: 'ok' | 'not-found' | … }
├── manifest.ts     <FoodContract> structural snapshot for the registry
└── __tests__/      round-trip Zod ↔ TS tests
openapi/
└── food.openapi.json   generated; committed for iOS Swift codegen
scripts/
├── generate-manifest.ts manifest type generator (PRD-155)
├── verify-manifest.ts   drift check for the committed manifest
├── render-manifest.ts   shared render helper
└── generate-openapi.ts  emits the OpenAPI snapshot from Zod schemas
```

## Pilot entity

The current snapshot ships a single `Recipe` entity as a deliberate stub —
just enough to anchor the round-trip tests and exercise the manifest +
OpenAPI generators. The shape is intentionally minimal (`id`, `name`,
`servings`, `lastEditedTime`) and does **not** mirror the live
`RecipeListItem` shape from `apps/pops-api/src/modules/food/recipes/types.ts`;
the full surface migration is follow-up work (PRD-153 US-07-style content
migration for food).

## Router type

`apps/pops-food-api` does not yet expose a tRPC `router.ts` (the food
pillar container is still on the Phase 3 scaffold). Until it does, the
contract's `FoodRouter` falls back to `unknown`. When the router lands,
flip `src/router.ts` to `import type { foodRouter } from '@pops/food-api/router'`
and drop the fallback.

## Rules

- **Zero runtime deps on `@pops/food-db`.** `food-db` is not a dependency
  of this package. Consumers depend on this package.
- **Types and schemas agree.** `z.infer<typeof XSchema>` must structurally
  equal `X` from `./types`. The round-trip test in `__tests__/schemas.test.ts`
  is the gate.
- **OpenAPI regenerates on every build.** `scripts/generate-openapi.ts`
  runs as part of `pnpm build`. The committed `openapi/food.openapi.json`
  is consumed by iOS Swift codegen.

See [PRD-153](../../docs/themes/13-pillar-finale/prds/153-contract-package-scaffold/README.md)
for the full design.
