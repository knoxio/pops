# US-02: Establish module pattern

> PRD: [008 — API Server](README.md)
> Status: To Review

## Description

As a developer, I want a reference module implementation (core/entities) so that all future modules follow the same pattern: router, service, types, tests.

## Acceptance Criteria

- [ ] `modules/core/entities/` exists with `router.ts`, `service.ts`, `types.ts`, `*.test.ts`
- [ ] `router.ts` defines tRPC procedures (list, getById, create, update, delete)
- [ ] `service.ts` contains business logic, called by router procedures
- [ ] `types.ts` defines domain types used by router and service
- [ ] At least one test file validates the service
- [ ] Pattern is documented (or self-evident from the reference implementation)
- [ ] `modules/core/index.ts` exports the core sub-router

## Notes

Core/entities is the reference implementation. Every future module (finance/transactions, media/movies, etc.) follows this exact structure. The pattern should be obvious enough that an agent can scaffold a new module by copying the reference.
