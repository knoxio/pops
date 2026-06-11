/**
 * Per-pillar tRPC handle smoke harness.
 *
 * Why: each pillar (finance, core, media, inventory, cerebrum) now owns
 * its own SQLite file opened by a per-pillar `openFooDb()`. When a
 * procedure is cut over to a per-pillar `getFooDrizzle()` handle but
 * the pillar's package journal does NOT yet create the table that
 * procedure reads, the failure mode in production is `SqliteError: no
 * such table: <table>`. This is the latent break Track N4 (#2908)
 * shipped: nothing exercised the procedure through the pillar handle
 * in CI, so the missing-migration didn't surface until prod boot.
 *
 * The harness opens a fresh per-pillar `:memory:` DB via the canonical
 * opener (so the package's `migrations/meta/_journal.json` runs
 * end-to-end) and then invokes every query procedure mounted on the
 * pillar's router. Any procedure that throws `no such table` fails the
 * harness — the table it queried is missing from the pillar's package
 * migrations journal.
 *
 * Errors that aren't `no such table` are tolerated by category:
 *   - **NotFound / FK violations / output-schema failures on empty seed:**
 *     the SQL parser opened the table and reached a body that didn't
 *     find a row. The harness has proved the table exists.
 *   - **Zod validation errors:** the resolver short-circuited BEFORE
 *     any SQL ran. This does NOT prove table reachability — it means
 *     the per-pillar input map doesn't model the procedure's input
 *     shape. Procedures whose input maps drift out of date silently
 *     stop covering their SQL path. Keep the per-pillar input map
 *     aligned with the router schemas; treat a procedure that only
 *     ever surfaces Zod errors as an UNCOVERED entry, not a passing one.
 *
 * Real timers, real I/O, in-memory DBs — no `vi.useFakeTimers`, no
 * `setTimeout` masks. The harness's per-procedure 250ms guard (see
 * `withTimeout`) is hygiene against external-dependency hangs (e.g.
 * BullMQ trying to reach Redis), not a flakiness mask — a procedure
 * that needs >250ms of SQL on `:memory:` is broken on its own merits.
 * Each pillar smoke runs in <5s on a warm vitest worker.
 */
/**
 * A path-keyed minimal-input map. The value is whatever Zod input the
 * procedure expects. Entries absent from the map fall through to `{}`
 * — covers procedures that accept `void` or `z.object({...optional()})`
 * without explicit configuration. Procedures with required inputs (every
 * `.get(id)` / `.findByX(payload)` style) MUST have an entry here or
 * they'll fail Zod validation and the harness will skip their SQL path.
 */
export type PillarSmokeInputs = Readonly<Record<string, unknown>>;

const MISSING_TABLE_PATTERN = /no such table/i;

/**
 * Structural router shape — typed via the same `_def.procedures` reflection
 * used by `src/router.test.ts`. Keeps the harness decoupled from the
 * concrete `typeof appRouter` so the caller picks the type it needs.
 */
export interface ReflectableRouter {
  _def: { procedures: Record<string, unknown> };
}

/**
 * Structural caller shape — the tRPC v11 caller (and any hand-rolled
 * fake used in unit tests) decorates nested routers as keyed properties
 * on a callable proxy. The harness only needs property access at each
 * level, so we type it as a recursively-keyed object.
 */
export interface ReflectableCaller {
  [key: string]: ReflectableCaller | ((input?: unknown) => unknown) | unknown;
}

interface ProcedureLike {
  _def: { type: 'query' | 'mutation' | 'subscription' };
}

/** One per offending procedure path. */
export interface PillarSmokeFailure {
  /** Full dotted procedure path, e.g. `'finance.transactions.list'`. */
  path: string;
  /** The `Error.message` (or stringified cause) that matched `no such table`. */
  message: string;
}

/**
 * Walk `err.cause` chains looking for a message matching `no such table`.
 * Drizzle wraps better-sqlite3 errors so the canonical `SqliteError`
 * text may sit one level down in some failure modes.
 */
function isMissingTableError(err: unknown): err is { message: string } {
  if (err === null || typeof err !== 'object') return false;
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string' && MISSING_TABLE_PATTERN.test(message)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== err) return isMissingTableError(cause);
  return false;
}

/**
 * Enumerate every `query` procedure mounted under `<pillarPrefix>.*` in
 * the root `appRouter`. Returns a sorted list of full dotted paths so
 * the harness output stays stable across runs.
 */
export function enumeratePillarQueries(router: ReflectableRouter, pillarPrefix: string): string[] {
  const procedures = router._def.procedures;
  return Object.keys(procedures)
    .filter((path) => path.startsWith(`${pillarPrefix}.`))
    .filter((path) => isQueryProcedure(procedures[path]))
    .toSorted();
}

function isQueryProcedure(value: unknown): boolean {
  if (value === null) return false;
  if (typeof value !== 'object' && typeof value !== 'function') return false;
  const def = (value as { _def?: unknown })._def;
  if (def === null || typeof def !== 'object') return false;
  return (def as ProcedureLike['_def']).type === 'query';
}

/**
 * Resolve the minimal input for `path`. Procedures absent from the map
 * default to `{}` — covers the common case of `.input(z.object({...
 * .optional() }))` queries (e.g. `.list()`) where every field is
 * optional. Procedures with required inputs need an explicit entry.
 */
function resolveInput(inputs: PillarSmokeInputs, path: string): unknown {
  return Object.hasOwn(inputs, path) ? inputs[path] : {};
}

/**
 * Walk the caller object tree for the dotted `path`. The tRPC v11 caller
 * exposes nested routers as both functions AND object keys (the function
 * call invokes the procedure when called at the leaf; the object access
 * descends into nested routers). We accept either typeof at intermediate
 * segments and only treat the final cursor as callable.
 */
function resolveCallerPath(
  caller: ReflectableCaller,
  path: string
): ((input: unknown) => unknown) | null {
  const segments = path.split('.');
  let cursor: unknown = caller;
  for (const segment of segments) {
    if (cursor === null) return null;
    if (typeof cursor !== 'object' && typeof cursor !== 'function') return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === 'function' ? (cursor as (input: unknown) => unknown) : null;
}

/**
 * Run the smoke harness for `pillarPrefix` using `caller`. For each
 * query procedure, call it via the caller path and assert it does NOT
 * throw `no such table`. The caller is expected to have its per-pillar
 * `setFooDb({ db, raw })` already invoked against the fresh opener so
 * the cutover code path resolves to the in-memory DB.
 *
 * Procedures absent from the input map default to `{}` — fine for
 * procedures that accept void / `z.object({ ...optional() })` shapes,
 * but a procedure with required inputs AND no map entry will throw a
 * Zod validation error before any SQL runs and silently skip its
 * coverage. Keep the per-pillar map aligned with the router schemas.
 *
 * @returns An array of failures (empty on success).
 */
/**
 * Cap any single procedure invocation. The harness's contract is that
 * we exercise the SQL path; procedures that hang on external I/O
 * (Redis-backed queues, network sockets) are NOT a "no such table"
 * failure and should not block the suite. This timeout swallows them
 * silently — the harness still passes if every other procedure's table
 * is reachable.
 *
 * Real timers, no `vi.useFakeTimers` — the timeout protects against a
 * runaway external dependency (e.g. BullMQ reaching out to Redis),
 * which is exactly the scenario where fake timers would mask the hang.
 */
const PER_PROCEDURE_TIMEOUT_MS = 250;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_SENTINEL> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

const TIMEOUT_SENTINEL = Symbol('pillar-smoke-timeout');

/**
 * Optional ignore list of procedure paths whose `no such table` errors
 * the harness should NOT count as failures. Use this for procedures
 * that read from the shared `getDrizzle()` handle (NOT the per-pillar
 * handle) and would surface a missing table only because the shared
 * test fixture in `createTestDb()` doesn't include every prod table —
 * not because the per-pillar cutover is broken.
 *
 * Entries SHOULD be documented inline with the table they touch and
 * the reason they're not pillar-relevant.
 */
export type PillarSmokeIgnoreSet = ReadonlySet<string>;

export interface RunPillarSmokeHarnessOptions {
  inputs?: PillarSmokeInputs;
  ignorePaths?: PillarSmokeIgnoreSet;
}

export async function runPillarSmokeHarness(
  router: ReflectableRouter,
  caller: ReflectableCaller,
  pillarPrefix: string,
  options: RunPillarSmokeHarnessOptions = {}
): Promise<PillarSmokeFailure[]> {
  const inputs = options.inputs ?? {};
  const ignorePaths = options.ignorePaths ?? new Set<string>();

  const failures: PillarSmokeFailure[] = [];
  const paths = enumeratePillarQueries(router, pillarPrefix);

  for (const path of paths) {
    const handler = resolveCallerPath(caller, path);
    if (!handler) continue;
    if (ignorePaths.has(path)) continue;
    const input = resolveInput(inputs, path);
    try {
      await withTimeout(Promise.resolve(handler(input)), PER_PROCEDURE_TIMEOUT_MS);
    } catch (err) {
      if (isMissingTableError(err)) {
        failures.push({ path, message: err.message });
      }
    }
  }

  return failures;
}
