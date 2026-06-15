# Server-side `pillar('<other>').*` consumer pattern

> Audience: engineers flipping a cross-pillar call site under PRD-247 US-03, PRD-248, PRD-249, or any subsequent H8 burn-down. This is a how-to reference, not an SDK architecture explainer. For the architecture, see [PRD-242](../prds/242-dynamic-approuter/README.md).

The server-side `pillar()` proxy lives at `packages/pillar-sdk/src/server/factory.ts`. It turns a previously-synchronous, same-process service call into an authenticated HTTP call against another pillar's `-api` container. This note pins down the conventions every migrated call site must follow.

## 1. Async signature contract

Every cross-pillar call is a network call. It is always `async`. The wrapping function becomes `async`; every caller of that function awaits it.

```ts
// Before — direct service call inside the same pillar.
import { settingsService } from '@pops/core-db';
import { getCoreDrizzle } from '@pops/core-db/runtime';

function loadPlexToken(): string | null {
  return settingsService.getSettingOrNull(getCoreDrizzle(), 'PLEX_TOKEN');
}

// After — cross-pillar SDK call.
import { pillar } from '@pops/pillar-sdk/server';

async function loadPlexToken(): Promise<string | null> {
  return pillar('core').settings.get({ key: 'PLEX_TOKEN' });
}
```

Functions higher up the stack become `async` in lockstep. Resist the temptation to wrap with `void` or fire-and-forget to "preserve the signature" — that hides the network failure mode the caller has to handle.

## 2. `PillarCallError` handling

The proxy returns the value on success and throws `PillarCallError` on transport, auth, or typed failure. The decision is binary: bubble, or translate.

- **Bubble (hot paths).** Plex sync, scheduler ticks, batch backfills. Surfacing the error upward lets the existing retry / circuit-breaker / observability layer do its job. Do not catch.
- **Translate (user-facing handlers).** tRPC procedures and Express handlers convert to `TRPCError` so the client sees a typed code, not a 500.

```ts
import { TRPCError } from '@trpc/server';
import { PillarCallError } from '@pops/pillar-sdk/errors';

export const getSetting = procedure.input(schema).query(async ({ input }) => {
  try {
    return await pillar('core').settings.get({ key: input.key });
  } catch (err) {
    if (err instanceof PillarCallError) {
      throw new TRPCError({
        code: err.kind === 'pillar-unavailable' ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
        cause: err,
        message: 'core settings unavailable',
      });
    }
    throw err;
  }
});
```

What you **never** do: catch `PillarCallError` and fall back to a direct `@pops/<other>-db` read. That re-introduces the H8 violation the burn-down is removing. Surface the error; let the caller decide.

## 3. Service-account auth

The server-side `pillar()` proxy authenticates with a single shared secret: `POPS_INTERNAL_API_KEY`. It loads from `process.env` at first-call time (lazy), and the proxy throws `PillarServerSdkError` if the key is missing. Fail-closed — no silent unauthenticated request ever leaves the process.

| Environment   | Source                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Local dev     | `.env.local` at the repo root. The bootstrap script (`pnpm bootstrap`) provisions a dev value.             |
| CI            | `apps/pops-api/test-fixtures/internal-api-key.ts` exports a fixed test value; loaded by the test harness.  |
| Container dev | `POPS_INTERNAL_API_KEY` set in the per-environment compose / k8s manifest. Same secret across all pillars. |

Rotating the key is a coordinated restart of every `-api` container — there is no per-pillar override.

## 4. Discovery-cache

The proxy caches a per-`pillarId` handle in-process. The first call to `pillar('core')` resolves discovery (registry → base URL); subsequent calls in the same process reuse the handle until the registry TTL expires. Hot loops do **not** refetch discovery.

```ts
async function syncManyShows(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await pillar('core').settings.get({ key: `LAST_SYNC_${id}` });
  }
}
```

The above does N wire calls but exactly one discovery fetch. The TTL is configured per-environment by the registry client; you do not tune it at the call site.

## 5. `getMany` / batch-read pattern

When a code path reads ≥2 settings (or ≥2 of any cross-pillar entity) in close sequence, use the `*Many` shape. A naive N-call port multiplies wire latency by N and is rejected at review.

```ts
// Worked example: Plex sync reads 3 settings per connect.
const { PLEX_TOKEN, PLEX_USERNAME, PLEX_URL } = await pillar('core').settings.getMany({
  keys: ['PLEX_TOKEN', 'PLEX_USERNAME', 'PLEX_URL'],
});
if (!PLEX_TOKEN || !PLEX_URL) return null;
```

`getMany` returns a `Record<string, string>` with missing keys omitted (per PRD-247 §`getMany` semantics). The caller falls back via `result[key] ?? defaultValue`. Empty input returns `{}` — not an error.

If the target surface has no `*Many` shape and your call site needs one, that is a surface bug — open a follow-up on the target PRD, do not paper over it with a `for` loop.

## 6. Mixed-tx coordination (Option D)

Cross-pillar SDK calls can not participate in a SQLite transaction on another pillar's handle. When a code path needs both a pillar-local commit and a cross-pillar write, the pattern is **Option D** from PRD-248: commit the pillar-local transaction first; fire the cross-pillar SDK call after; rely on idempotent retries (or a reconciler) to absorb partial failure.

```ts
db.transaction((tx) => {
  insertWatchHistory(tx, entry);
  removeFromWatchlist(tx, entry.mediaId);
});

try {
  await pillar('cerebrum').debrief.logWatchCompletion({
    watchHistoryId: entry.id,
    mediaType: entry.mediaType,
    mediaId: entry.mediaId,
  });
} catch (err) {
  if (err instanceof PillarCallError) {
    logger.warn({ err, watchHistoryId: entry.id }, 'debrief queue deferred — will self-heal');
    return;
  }
  throw err;
}
```

The user's local write is the source of truth. The cross-pillar side-effect must be idempotent on retry. See [`media-watch-history-mixed-tx-design.md`](media-watch-history-mixed-tx-design.md) for the invariant analysis and PRD-248 §Option D for the formal contract.

## 7. When NOT to use the typed proxy

The typed proxy is for in-repo pillars (pillars whose router type lives in a `packages/<id>-contract` workspace). For pillars registered at runtime via PRD-228 — i.e. external pillars in another repo — use `callDynamic`:

```ts
await pillar('externalThing').callDynamic('widgets', 'list', { limit: 10 });
```

The runtime route is identical; the split is purely a compile-time typing decision. See [`internal-vs-external-pillar-call-sites.md`](internal-vs-external-pillar-call-sites.md) for the full breakdown and worked examples on both sides.

## 8. Anti-patterns

- **Naive N-call port of a batch read.** Replacing `getBulkSettings(db, [...keys])` with `for (const k of keys) await pillar('core').settings.get({ key: k })`. Use `getMany`. If the surface lacks `*Many`, fix the surface, not the call site.
- **Catch-and-fallback to direct `@pops/<other>-db` read.** Catching `PillarCallError` and reading the other pillar's DB on failure. Re-introduces the H8 violation the burn-down is removing. Surface the error.
- **Top-level `await pillar('<other>')` at module scope.** Triggers the `POPS_INTERNAL_API_KEY` check at import time and couples module load order to env-var availability. Move the proxy access inside the function body where it is used (lazy).
- **Wrapping every call in `try/catch` "to be safe".** Catching without translating turns a typed network failure into a silently-swallowed `undefined`. Either bubble or translate to `TRPCError` — never swallow.
- **`as any` / `as unknown as Type` on the result.** The proxy is fully typed against the target contract. If TypeScript complains, the contract is wrong or the input shape is wrong — fix it, do not cast.

## References

- [PRD-242](../prds/242-dynamic-approuter/README.md) — dynamic `AppRouter` composition; defines the typed proxy.
- [PRD-247](../prds/247-core-settings-sdk-surface/README.md) — `core.settings.*` surface (the first in-pillar consumer of this pattern).
- [PRD-248](../prds/248-cerebrum-debrief-sdk-surface/README.md) — `cerebrum.debrief.*` surface; Option D origin.
- [PRD-249](../prds/249-cerebrum-embeddings-sdk-surface/README.md) — `cerebrum.embeddings.*` surface; read-only batch shape.
- [`internal-vs-external-pillar-call-sites.md`](internal-vs-external-pillar-call-sites.md) — typed proxy vs `callDynamic`.
- [`media-watch-history-mixed-tx-design.md`](media-watch-history-mixed-tx-design.md) — Option D background.
- `packages/pillar-sdk/src/server/factory.ts` — implementation.
- `packages/pillar-sdk/src/errors.ts` — `PillarCallError`, `PillarServerSdkError`, `isOk` helpers.
