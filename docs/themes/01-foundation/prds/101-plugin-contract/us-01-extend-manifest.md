# US-01: Extend ModuleManifest with cross-cutting slots

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a platform engineer, I want `ModuleManifest` to carry every slot the cross-cutting concerns need (settings, features, search, AI tools, URI handler, migrations, capabilities) so that adding a module is one file and the platform discovers everything else from it.

## Acceptance Criteria

- [ ] `ModuleManifest` adds `capabilities?: readonly Capability[]` (typed RBAC scope ids); the existing `provides` field is removed.
- [ ] `ModuleFrontendManifest` is unchanged structurally (already has `routes`, `navConfig`, `overlay`).
- [ ] `ModuleBackendManifest` adds `aiTools?: readonly AiToolDescriptor[]`, `migrations?: readonly MigrationDescriptor[]`, and `ingestSources?: readonly IngestSourceDescriptor[]` (the last only as a typed slot — Cerebrum is the only consumer).
- [ ] Top-level adds `features?: readonly FeatureManifest[]`, `search?: readonly SearchAdapterDescriptor[]`, and `uriHandler?: UriHandlerDescriptor`.
- [ ] New descriptor types are exported from `@pops/types` with JSDoc on every field.
- [ ] `assertModuleManifest()` validates each new slot's structural shape; failures name the offending field with the module id in the error.
- [ ] Every existing module manifest (`packages/app-finance`, `app-media`, `app-inventory`, `app-cerebrum`, `app-ai`, `overlay-ego`) compiles against the new shape with no behaviour change. Slots that don't apply yet are simply omitted.
- [ ] Type tests in `packages/types` exercise: `Capability` typed-scope inference, `MODULES` id union narrowing, descriptor optionality.

## Notes

- `Capability` is a string template-literal type: `${ModuleId}.${string}` — keeps it free-form within a module's namespace while preventing typos at the module boundary.
- `MigrationDescriptor` shape: `{ id: string; sql: string }` (id matches the canonical `schema_migrations` version key).
- `UriHandlerDescriptor` shape: `{ types: readonly string[]; resolve: (type: string, id: string) => Promise<UriResolution> }`. `UriResolution` is a discriminated union: `{ kind: 'object'; data: ... }` | `{ kind: 'not-found' }` | `{ kind: 'module-absent' }`.
- `AiToolDescriptor` mirrors the MCP tool shape (name, description, input schema, handler).
- `SearchAdapterDescriptor` mirrors today's `SearchAdapter` interface from `apps/pops-api/src/modules/core/search/types.ts`.
- This US is metadata-only — no consumer wired yet. Consumers come in US-03..US-10.
