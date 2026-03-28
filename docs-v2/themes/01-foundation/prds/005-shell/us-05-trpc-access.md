# US-05: Set up tRPC client and app package access pattern

> PRD: [005 — Shell](README.md)
> Status: Done

## Description

As a developer, I want tRPC configured in the shell with a clear import pattern for app packages so that any app can make type-safe API calls.

## Acceptance Criteria

- [x] `apps/pops-shell/src/lib/trpc.ts` configures the tRPC client
- [x] tRPC provider wraps the entire app in the provider stack
- [x] App packages can import and use tRPC hooks (e.g., `trpc.finance.transactions.list.useQuery()`)
- [x] The import path for tRPC in app packages is documented and consistent
- [x] TypeScript resolves the `AppRouter` type correctly — procedure names autocomplete
- [x] No circular dependencies between shell and app packages
- [x] React Query devtools available in development

## Notes

App packages depend on `@pops/ui` and shared packages, never on other app packages. For tRPC access, the cleanest approach is a shared `@pops/api-client` package that holds the tRPC client config, avoiding any dependency on the shell itself.
