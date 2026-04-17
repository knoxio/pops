# ADR-017: OpenAPI as Secondary API Contract

## Status

Accepted

## Context

tRPC provides end-to-end type safety between the React frontend and Express backend (see ADR-014). This works because both sides share a TypeScript type system in the same monorepo. Future services — Cortex (potentially Python), native mobile apps, home automation integrations, Moltbot extensions — cannot consume tRPC types. They need an API contract they can import or generate clients from. Maintaining a separate REST API alongside tRPC would double the API surface and drift over time.

## Options Considered

| Option                 | Pros                                                                | Cons                                                                               |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Keep tRPC only         | No additional work, no drift risk                                   | Non-TS consumers have no contract, must reverse-engineer HTTP calls                |
| Replace tRPC with REST | Universal compatibility                                             | Lose end-to-end type safety, massive rewrite, regression risk                      |
| Replace tRPC with gRPC | Language-neutral, performant, strong contracts via protobuf         | Massive rewrite, browser support requires grpc-web proxy, poor fit for React Query |
| trpc-openapi bolt-on   | Annotate existing routers, generate OpenAPI 3.1 spec from live code | Additional metadata on each procedure, spec may lag if annotations are forgotten   |
| Parallel OpenAPI spec  | Hand-written spec independent of tRPC                               | Will drift from implementation, two sources of truth                               |

## Decision

trpc-openapi as a bolt-on to existing routers. Each tRPC procedure that needs external access gets an `.meta()` annotation with HTTP method, path, and description. The OpenAPI 3.1 spec is generated from live router definitions — it cannot drift because it reads the same Zod schemas that tRPC uses.

The approach is incremental: only procedures that external consumers need are annotated. Internal-only procedures (UI-specific queries, batch operations) stay tRPC-only.

## Consequences

- tRPC remains the primary API for the React frontend — no changes to existing frontend code
- External consumers get an auto-generated OpenAPI 3.1 spec at `/api/openapi.json` and Swagger UI at `/api/docs`
- New procedures follow a convention: if it's domain CRUD (create, read, list, update, delete), annotate it. If it's UI-specific (search suggestions, form validation), skip it
- Client generation via `openapi-typescript` or equivalent gives non-TS consumers typed access
- CI validates that annotated procedures have complete OpenAPI metadata (no partial annotations)
- The OpenAPI spec is a read-only view of the tRPC API — tRPC remains the source of truth for types
