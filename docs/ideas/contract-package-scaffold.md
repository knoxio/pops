# Contract scaffold tooling

Gaps left over from the pillar contract scaffold. The shape is real and consistent across pillars, but two pieces of tooling described in the original plan were never built, and one pillar is missing the manifest-generator pair.

## `gen:contract <pillar>` scaffold command

There is no scaffold script that stamps `pillars/<id>/src/contract/` (barrel, `rest.ts`, `types/`, `schemas/`, `errors.ts`, `router.ts`, `manifest.ts`, the four `scripts/generate-*` + `verify-manifest.ts`, `package.json` `files`/`exports`/`scripts`, and the three `__tests__`) for a brand-new pillar. Every contract today is hand-authored to match the existing ones by copy. A generator would:

- Stamp the directory layout + `package.json` (name `@pops/<id>`, `files: ["dist/contract/**", "openapi/<id>.openapi.json"]`, the standard `exports` and `generate:*`/`verify:*` scripts).
- Emit stub `rest.ts` (`initContract().router({}, { pathPrefix: '', strictStatusCodes: false })`), an empty `types/`+`schemas/` pair, `errors.ts` with the shared `ContractStatus`, `router.ts` (`= unknown`), and `manifest.ts`.
- Wire the per-pillar quality CI workflow with the OpenAPI / api-types / manifest drift checks.

Until it exists, adding a pillar means copying an existing contract and renaming.

## Finance is missing the manifest generator pair

`pillars/finance` ships a committed `src/contract/manifest.generated.ts` but has **no** `scripts/generate-manifest.ts` or `scripts/verify-manifest.ts`, and its `build` does not run `verify:manifest`. The committed file's header even references `pnpm -F @pops/finance-contract generate:manifest` (dead `-contract` naming) and `scripts/generate-manifest.ts`, neither of which exists. Lists, inventory, food, and cerebrum all carry the generator + verifier and gate `build` on `verify:manifest`.

Bring finance to parity:

- Add `scripts/generate-manifest.ts` (+ a shared `render-manifest.ts` like lists) and `scripts/verify-manifest.ts`.
- Add `generate:manifest` / `verify:manifest` to `package.json` scripts and prepend `verify:manifest` to `build`.
- Regenerate `manifest.generated.ts` so its header stops naming the dead `@pops/finance-contract` package and points at the real generator.
