# US-03: Routing and API composition from the registry

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a platform engineer, I want the shell's route table and the API's root tRPC router composed from `MODULES` so that adding or removing a module requires no edit in the shell or root router.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/router.tsx` builds its app-route list from `MODULES.filter(m => m.surfaces.includes('app'))`. No module name appears literally in the router file.
- [ ] `RequireModule` is removed; the shell already only mounts routes for installed modules so the runtime guard becomes redundant. Direct navigation to an absent module's URL still renders `NotInstalledPage` via a catch-all route.
- [ ] `apps/pops-api/src/router.ts` composes the root tRPC router from `MODULES.map(m => m.backend?.router).filter(Boolean)`. No module name appears literally in the root router file.
- [ ] `moduleGate` middleware (PRD-100) is retained as a defence-in-depth check on procedure paths but no longer performs the primary gating — absent modules' routers are not in the root.
- [ ] `core.shell.manifest` continues to return `{ apps, overlays }` derived from `MODULES`; the OpenAPI mirror is unchanged.
- [ ] Existing E2E tests covering install-set scenarios (finance-only, cerebrum-absent) still pass.

## Notes

- This is the load-bearing change: the static `appRouter` shape is now derived from `MODULES`, so the tRPC client's inferred type set narrows to the installed modules. Frontend code that references absent modules becomes a type error at build time, not a runtime `NOT_FOUND`.
- `core` remains explicitly composed in the root router (it's not in `MODULES`).
- Shell's catch-all route renders `NotInstalledPage` with the requested module id derived from the URL path's first segment.
