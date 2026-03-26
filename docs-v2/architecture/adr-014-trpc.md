# ADR-014: tRPC Over REST or GraphQL

## Status

Accepted

## Context

POPS needs an API layer between the React frontend and the Express backend. With 10+ domain modules and growing, the API surface is large. The frontend and backend live in the same monorepo, built by the same developer (with AI agents), and deployed together.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| REST (Express routes) | Simple, universally understood, no tooling | No type safety across the boundary, manual request/response typing, versioning overhead, boilerplate for CRUD |
| GraphQL | Flexible queries, typed schema, introspection | Schema definition language adds overhead, resolver boilerplate, overkill for single-user with one frontend, over-fetching isn't a real problem here |
| tRPC | End-to-end type safety (change a return type and the frontend knows immediately), zero codegen, zero schema definition, RPC model maps naturally to service functions | Coupled to TypeScript — only works when client and server share a type system. Not suitable for public APIs |

## Decision

tRPC. The coupling limitation is irrelevant — POPS has one frontend, one backend, both TypeScript, same monorepo. The benefits are significant:

- Change a procedure's return type and every callsite gets a compile error immediately — no runtime surprises
- No schema files, no codegen step, no OpenAPI spec to maintain
- Procedures map 1:1 to service functions — `trpc.media.movies.list` calls `movieService.list()`
- React Query integration via `@trpc/react-query` gives caching, invalidation, and optimistic updates for free

## Consequences

- End-to-end type safety from database row to React component with zero manual type definitions at the API boundary
- Adding a new endpoint is: write service function, add procedure to router — no schema update, no codegen
- Not suitable if POPS ever needs a public API or non-TypeScript clients — but that's not on the roadmap
- All domain modules follow the same pattern: `router.ts` (tRPC procedures) calls `service.ts` (business logic)
