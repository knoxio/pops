# Server-side `pillar('<other>').*` consumer pattern

> Theme: [Federation](README.md)
>
> Audience: engineers writing a server-side cross-pillar call site. This is a how-to reference, not an SDK architecture explainer. For the architecture, see [Server surface](prds/server-surface/README.md).

The server-side `pillar()` proxy lives at `libs/sdk/src/server/factory.ts` and is exported from `@pops/pillar-sdk/server`. It turns what would otherwise be a same-process service call into an authenticated REST call against another pillar's container, resolved through the live registry. A peer is reached only through its published `@pops/<peer>` contract and REST API — never its DB, services, or internal paths. This note pins down the conventions every server call site must follow.

## 1. Async signature contract

Every cross-pillar call is a network call. It is always `async`. The wrapping function becomes `async`; every caller of that function awaits it.

```ts
// Wrong — there is no in-process service to call; another pillar owns this data.
function loadPlexToken(): string | null {
  /* ...reach into another pillar's DB... */
}

// Right — cross-pillar SDK call against the owning pillar's REST contract.
import { pillar } from '@pops/pillar-sdk/server';

async function loadPlexToken(): Promise<string | null> {
  return pillar('registry').settings.get({ key: 'PLEX_TOKEN' });
}
```

Functions higher up the stack become `async` in lockstep. Resist the temptation to wrap with `void` or fire-and-forget to "preserve the signature" — that hides the network failure mode the caller has to handle.

## 2. `PillarCallError` handling

The proxy returns the value on success and throws `PillarCallError` (re-exported from `@pops/pillar-sdk/server`) on transport, auth, or typed failure. The decision is binary: bubble, or translate.

- **Bubble (hot paths).** Sync jobs, scheduler ticks, batch backfills. Surfacing the error upward lets the existing retry / circuit-breaker / observability layer do its job. Do not catch.
- **Translate (request handlers).** A pillar's own contract handler maps the failure to its own HTTP error envelope so the client sees a typed status, not an opaque 500.

```ts
import { PillarCallError } from '@pops/pillar-sdk/server';

async function getSetting(key: string) {
  try {
    return await pillar('registry').settings.get({ key });
  } catch (err) {
    if (err instanceof PillarCallError) {
      throw toHttpError(
        err.kind === 'pillar-unavailable' ? 503 : 500,
        'registry settings unavailable',
        { cause: err }
      );
    }
    throw err;
  }
}
```

What you **never** do: catch `PillarCallError` and fall back to reading the other pillar's database directly. That re-introduces the cross-pillar coupling the consumer-import lint gate forbids. Surface the error; let the caller decide.

## 3. Service-account auth

The server-side `pillar()` proxy authenticates with a single shared secret, sent as `X-API-Key` and read from the `POPS_INTERNAL_API_KEY` env var. It resolves the key at first-call time (lazy), and throws `PillarServerSdkError` if the key is missing. Fail-closed — no silent unauthenticated request ever leaves the process.

| Environment   | Source                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Local dev     | `.env` at the repo root; the bootstrap step provisions a dev value.                                    |
| CI            | A fixed test value exported by the test harness fixtures.                                              |
| Container dev | `POPS_INTERNAL_API_KEY` set in the per-environment compose / homelab manifest. Same secret fleet-wide. |

The docker network is the trust boundary ([ADR-027](../../architecture/adr-027-runtime-pillar-registry.md)): server-to-server calls authenticate with the shared service-account key — no mTLS, request signing, or token exchange between pillars. Rotating the key is a coordinated restart of every pillar container; there is no per-pillar override.

## 4. Discovery cache

The proxy caches a per-`pillarId` handle in-process. The first call to `pillar('registry')` resolves discovery (registry → base URL); subsequent calls in the same process reuse the handle until the registry TTL expires. Hot loops do **not** refetch discovery.

```ts
async function syncMany(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await pillar('registry').settings.get({ key: `LAST_SYNC_${id}` });
  }
}
```

The above does N wire calls but exactly one discovery fetch. The TTL is configured per-environment by the registry client; you do not tune it at the call site.

## 5. `getMany` / batch-read pattern

When a code path reads ≥2 settings (or ≥2 of any cross-pillar entity) in close sequence, use the contract's `*Many` shape. A naive N-call port multiplies wire latency by N and is rejected at review.

```ts
// Worked example: a sync path reads 3 settings per connect.
const { PLEX_TOKEN, PLEX_USERNAME, PLEX_URL } = await pillar('registry').settings.getMany({
  keys: ['PLEX_TOKEN', 'PLEX_USERNAME', 'PLEX_URL'],
});
if (!PLEX_TOKEN || !PLEX_URL) return null;
```

A `getMany` surface returns a `Record<string, string>` with missing keys omitted; the caller falls back via `result[key] ?? defaultValue`, and empty input returns `{}` — not an error.

If the target contract has no `*Many` shape and your call site needs one, that is a contract gap — open a follow-up against the owning pillar's contract, do not paper over it with a `for` loop.

## 6. Mixed-write coordination

Cross-pillar SDK calls cannot participate in a SQLite transaction on another pillar's handle — each pillar owns its own database. When a code path needs both a pillar-local commit and a cross-pillar write, commit the pillar-local transaction first, fire the cross-pillar SDK call after, and rely on idempotent retries (or a reconciler) to absorb partial failure.

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

The user's local write is the source of truth. The cross-pillar side-effect must be idempotent on retry.

## 7. In-repo vs. external pillars

The proxy is generic over the target contract's router type: `pillar<TRouter>('id')`. For an in-repo pillar you import its router type from its `@pops/<id>` contract package and get full compile-time typing. For an external pillar registered at runtime — one whose contract package this repo never installs — you call the same proxy with `PillarId` widened to `string`; the runtime route is identical, the only difference is how much the type checker knows. There is no separate dynamic-call API: the registry resolves the target the same way regardless of language or repo of origin.

## 8. Anti-patterns

- **Naive N-call port of a batch read.** Use the contract's `*Many` shape. If the contract lacks it, fix the contract, not the call site.
- **Catch-and-fallback to a direct read of the other pillar's DB.** Re-introduces the cross-pillar coupling the consumer-import lint gate removes. Surface the error.
- **Top-level `await pillar('<other>')` at module scope.** Triggers the `POPS_INTERNAL_API_KEY` check at import time and couples module load order to env-var availability. Move the proxy access inside the function body where it is used (lazy).
- **Wrapping every call in `try/catch` "to be safe".** Catching without translating turns a typed network failure into a silently-swallowed `undefined`. Either bubble or translate to your pillar's HTTP error envelope — never swallow.
- **`as any` / `as unknown as Type` on the result.** The proxy is fully typed against the target contract. If TypeScript complains, the contract or the input shape is wrong — fix it, do not cast.

## References

- [Server surface](prds/server-surface/README.md) — the server-side `pillar()` proxy: auth, internal targeting, handle memoisation.
- [Discovery client](prds/discovery-client/README.md) — registry-backed discovery cache the proxy resolves through.
- [Consumer import discipline](prds/consumer-import-discipline/README.md) — the lint gate forbidding a consumer from reaching behind a peer's contract.
- [Capability projection types](prds/capability-projection-types/README.md) — `PillarCallError`, `PillarId`, and the typed-proxy machinery.
- `libs/sdk/src/server/factory.ts` — implementation.
- `libs/sdk/src/server/errors.ts`, `libs/sdk/src/client/errors.ts` — `PillarServerSdkError`, `PillarCallError`, `isOk` helpers.
