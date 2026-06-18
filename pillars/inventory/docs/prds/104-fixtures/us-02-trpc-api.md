# US-02: tRPC service & router

> PRD: [PRD-104 — Fixtures Data Model](README.md)
> Status: Done

## Goal

Implement the fixtures service (data access layer) and tRPC router, wire it into the inventory router, and cover all procedures with integration tests against in-memory SQLite.

## Acceptance Criteria

- [x] `apps/pops-api/src/modules/inventory/fixtures/service.ts` — implements `listFixtures`, `getFixture`, `createFixture`, `updateFixture`, `deleteFixture`, `connectItemToFixture`, `disconnectItemFromFixture`, `listFixturesForItem`
- [x] `apps/pops-api/src/modules/inventory/fixtures/router.ts` — 8 `protectedProcedure` endpoints wiring service to tRPC; maps `NotFoundError` → `NOT_FOUND`, `ConflictError` → `CONFLICT`
- [x] Router mounted at `inventory.fixtures` in `apps/pops-api/src/modules/inventory/index.ts`
- [x] `apps/pops-api/src/shared/test-utils.ts` — DDL for both tables added to `createTestDb()`; `seedFixture()` and `seedItemFixtureConnection()` helpers added
- [x] `fixtures.test.ts` — integration tests covering all 8 procedures: list (filters, pagination), get (found/not found), create (required + optional fields), update (partial, null-clear, NOT_FOUND), delete (cascade, NOT_FOUND), connect (happy path, CONFLICT, NOT_FOUND), disconnect (happy path, NOT_FOUND), listForItem (empty, paginated, isolation)
- [x] Auth guard verified: `list`, `create`, `connect` reject unauthenticated callers
- [x] Full test suite passes (`pnpm test` in `apps/pops-api`)
