# US-01: Promote debrief schemas + types to a cross-pillar shared module

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a downstream PRD-248 US (US-02, US-03, US-04), I want the zod schemas and TypeScript types for `Session`, `Result`, `Status`, and the input shapes for each procedure to live in one location reachable from both the in-monolith handlers and the new cerebrum-api router. No router code lands in this US — only the shape work.

## Acceptance Criteria

- [ ] Zod schemas for debrief shapes live in a single module:
  - [ ] `DebriefSessionSchema` — matches the `debriefSessions` table row, including the denormalised `mediaType` + `mediaId` columns from commit 9df171fe.
  - [ ] `DebriefResultSchema` — matches `debriefResults` row.
  - [ ] `DebriefStatusSchema` — matches `debriefStatus` row.
  - [ ] Input schemas for each of the 8 procedures (`RecordInputSchema`, `DismissInputSchema`, `ListPendingInputSchema`, `CreateInputSchema`, `GetInputSchema`, `GetByMediaInputSchema`, `LogWatchCompletionInputSchema`, `DeleteByWatchHistoryIdInputSchema`).
- [ ] The schemas live under a location reachable from both `apps/pops-api` (current in-monolith handlers) and `apps/pops-cerebrum-api` (new router). Pick one: a) promote to `@pops/cerebrum-db` types module, b) promote to a `packages/contracts-cerebrum` shared shapes module, c) keep in `apps/pops-cerebrum-api` and import from monolith handlers. US-01 picks at PR time; document the choice in the PR body.
- [ ] The `debriefSessions` denormalised columns (`mediaType` + `mediaId`) are present in the schema and the underlying drizzle definition (verify the migration shipped in commit 9df171fe).
- [ ] A type-level test (or compile-only assertion) asserts that:
  - [ ] `DebriefSessionSchema` parses a row produced by the live drizzle table.
  - [ ] `GetByMediaInputSchema` rejects a payload missing `mediaType` or `mediaId`.
- [ ] No router procedure is registered in this US. The schemas are the only deliverable.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Reuse, don't re-define. If the existing `apps/pops-api/src/modules/cerebrum/debrief/...` already has zod shapes for `Session` / `Result`, promote them; don't author parallel ones.
- The denormalised columns (`mediaType`, `mediaId`) are the load-bearing change that lets `getByMedia` skip the SQL inner-join. If they are not present in the live drizzle definition at PR time, surface that as a blocker — the design depends on them.
- The cerebrum-side service layer for `createDebriefSession` + `queueDebriefStatus` already exists in the monolith handlers. US-02..US-04 will mount routers that call into it. US-01 just shapes the types they consume.
