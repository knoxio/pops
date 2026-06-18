# 03 — Frontend & browser-client REST cutover

Parent: [`00-completion-overview.md`](./00-completion-overview.md).

## Goal

Remove **every** trace of tRPC from the frontend and the browser client:

- **`app-finance`** — the only un-migrated FE app — converted off the 25 `usePillar*` (legacy
  tRPC) call sites onto its generated `finance-api` Hey client.
- **Browser `@pops/api-client`** — `createTRPCReact` / `splitLink` / `httpBatchLink` deleted;
  the shell no longer mounts a `<trpc.Provider>`.
- **`pops-shell`** — the residual `/trpc` catch-all (global search + nudge bell) removed; those
  two surfaces repointed onto REST.
- **Type-only shims** — the `…Router = AnyTRPCRouter` aliases in
  `lists/inventory/finance/media` contracts and the `inferRouterInputs/Outputs` imports in
  `app-finance`, plus the orphan `@trpc/server` dep in `app-food`, all deleted.
- **`TRPC_PILLARS`** — not just empty (`packages/pillar-sdk/src/capabilities/known-pillar-id.ts:42`)
  but **removed**, along with `PILLAR_TRPC_URLS` and the split-link plumbing.

End state: every `packages/app-*` ships only an `openapi-ts` client; `rg "@trpc\|usePillar\|TRPC_PILLARS"`
over `packages/` + `apps/pops-shell` returns zero.

## Three tracks

### Track A — `app-finance` conversion (independent, start now)

The other 7 apps are the template. Convert the 25 `usePillar*` sites (across 17 files) to
react-query + the generated `finance-api` SDK, with the `['finance', <module>, <op>, <input?>]`
key convention (mutations invalidate `['finance', <module>]`). Fan out **by feature area** —
these touch disjoint files, so they parallelise:

| Slice                    | Files (heaviest)                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 entities              | `src/pages/entities/useEntitiesPage.ts` (Query+Mutation+Utils CRUD)                                                                                                                                                                                                                                   |
| A2 rules-browser         | `src/pages/rules-browser/useRulesBrowserModel.ts`, `rule-form/useRuleFormState.ts`                                                                                                                                                                                                                    |
| A3 imports / corrections | `src/components/imports/hooks/{useApplyRejectMutations,usePreviewEffects,useProposalGeneration}.ts`, `bulk-assignment/use-accept.ts`, `correction-proposal/workflow/useWorkflowHooks.ts`, `rule-manager/useBrowseRules.ts`, `ConfidenceSlider.tsx`, `RulePicker.tsx`                                  |
| A4 type imports + deps   | Delete the 2 `inferRouterInputs/Outputs` imports in `components/imports/{tag-rule-dialog,correction-proposal}/types.ts` (repoint to `finance-api` generated types); drop `@pops/api`, `@pops/pillar-sdk/react`, `@trpc/server` from `package.json`; update the SDK mocks in the 4 affected test files |

`A1 ∥ A2 ∥ A3` (parallel), then `A4` (barrier — removes the deps once no call site needs them).

### Track B — global surfaces → REST (start now, partly gated)

The shell `/trpc` catch-all (`apps/pops-shell/src/lib/trpc.ts`, `LEGACY_TRPC_URL='/trpc'`) exists
**only** for two cross-cutting surfaces. Repoint each onto a pillar REST client:

| Surface                                                                  | Today            | Target                                                                                                   |
| ------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------- |
| Nudge bell (`NudgeIndicator.tsx` → `trpc.cerebrum.nudges.list.useQuery`) | monolith `/trpc` | `cerebrum-api` Hey client (`/cerebrum-api`) — cerebrum already serves nudges over REST                   |
| Global search                                                            | monolith `/trpc` | `orchestrator-api` Hey client (`/orchestrator-api`, port 3009) — orchestrator owns federated search (C2) |

`B1 (nudge → cerebrum) ∥ B2 (search → orchestrator)` can both proceed now (the REST endpoints
exist). **B3 (delete the catch-all + the tRPC browser client) is the barrier** — gated on B1+B2
**and** on `02` (the monolith `/trpc` must be gone). B3 deletes:

- `apps/pops-shell/src/lib/trpc.ts`, the `<trpc.Provider>` mount in `App.tsx`.
- `packages/api-client/src/{index,app-router,split-link,batching-invariants}.ts` (the entire tRPC
  browser client package — confirm nothing else imports it, then delete the package).
- the `/trpc` proxy in `apps/pops-shell/vite.config.ts` and the nginx catch-all (the nginx part is
  tracked in `04`).

### Track C — type-only shim cleanup (independent tail)

Once `app-finance` is off `@pops/api` types (A4) and inventory's cron no longer needs the alias:

- Delete `…Router = AnyTRPCRouter` from `pillars/{lists,inventory,finance,media}/src/contract/router.ts`
  and drop `@trpc/server` from those four `package.json`s. (food's `contract/router.ts` is already
  `type FoodRouter = unknown`; just drop its **orphan** `@trpc/server` dep.)
- Remove `TRPC_PILLARS` + `PILLAR_TRPC_URLS` from `packages/pillar-sdk` and `packages/api-client`.
- `pillars/inventory/src/api/cron/reconcile-cross-pillar.ts` still imports `@trpc/server` types —
  repoint to the generated peer client types.

Track C is fully parallel with A and B; its only constraint is that the shims are _type-only_, so
deleting them is safe once their importers stop referencing the router types.

## Verification (Done when)

| #   | Check                        | Signal                                                                                                                                                               |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `app-finance` has no tRPC    | `rg -n "usePillar" packages/app-finance/src` → **0**; `rg "@trpc\|@pops/api\b\|@pops/pillar-sdk/react" packages/app-finance/package.json` → **0**                    |
| V2  | No browser tRPC client       | `packages/api-client` deleted (or contains no `createTRPCReact/splitLink/httpBatchLink`); `rg "createTRPCReact\|httpBatchLink\|splitLink" --glob '!docs/**'` → **0** |
| V3  | Shell has no `/trpc`         | `apps/pops-shell/src/lib/trpc.ts` gone; no `<trpc.Provider>`; `vite.config.ts` has no `/trpc` proxy                                                                  |
| V4  | Nudge + search on REST       | nudge bell calls `/cerebrum-api`; global search calls `/orchestrator-api` — verified in the browser network tab, no `/trpc` requests                                 |
| V5  | No shims / no `TRPC_PILLARS` | `rg -n "AnyTRPCRouter\|TRPC_PILLARS\|PILLAR_TRPC_URLS\|inferRouterInputs\|inferRouterOutputs" --glob '!docs/**'` → **0**                                             |
| V6  | No `@trpc/*` deps            | `rg '"@trpc/' --glob '**/package.json'` → **0**                                                                                                                      |
| V7  | FE green                     | every `packages/app-*` typechecks + tests; `fe-quality.yml` green repo-wide (achievable only after `02`)                                                             |

## Parallelisation summary

- **Now, concurrently:** Track A (A1∥A2∥A3) + Track B (B1∥B2) + Track C (shim deletes whose
  importers are already clean).
- **Barriers:** A4 (after A1–A3), B3 (after B1+B2 **and** `02`).
- **Critical path to FE-done:** A1–A3 → A4 ; and `02` → B3. B3 is the last FE PR.

## Gotchas

- **`usePillar*` is tRPC, not REST.** Despite the name, `usePillarQuery/Mutation/Utils` from
  `@pops/pillar-sdk/react` dispatch through `split-link` → `/trpc`. Converting a site means
  replacing the hook with the generated `finance-api` SDK call wrapped in react-query — not just
  re-pointing a base URL.
- **Don't delete the catch-all early.** B3 is gated on `02`: while the monolith still serves
  `/trpc`, removing the shell catch-all breaks any surface still routed there.
- **Keep the streaming paths raw.** `overlay-ego`'s streaming chat hook talks to the SSE endpoint
  directly (`fetch` + `ReadableStream`), not the generated SDK — leave it; only non-streaming CRUD
  uses the client. (overlay-ego is already on the `ego` Hey client for the rest.)
