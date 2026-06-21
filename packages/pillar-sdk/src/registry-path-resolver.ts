/**
 * Self-healing path resolver for the registry handshake/discovery rollout.
 *
 * PREPARATORY in Phase 0: this resolver is NOT yet wired into the transport or
 * discovery. Core still serves ONLY the legacy dotted routes
 * ({@link LEGACY_REGISTRY_PATHS}) and the SDK still calls them directly. The
 * resolver lands here so Phase 1/2 can flip on dual-serve + fallback without a
 * second logic change.
 *
 * Once that flip happens, two HTTP paths serve one logical registry operation
 * during the rolling-deploy window: the new slash form ({@link REGISTRY_PATHS})
 * and the legacy dotted form. A caller will try
 * {@link RegistryPathResolver.candidates} in order, call
 * {@link RegistryPathResolver.remember} on the first 200, and call
 * {@link RegistryPathResolver.invalidate} on a 404 against the cached path.
 *
 * The cache is a HINT, not a lock. `candidates()` keeps BOTH paths reachable
 * even after a winner is cached, so a 404 on the cached path falls through to
 * the other candidate within the SAME call — no failed heartbeat. `invalidate()`
 * then drops the hint so the next call re-resolves from scratch. This is what
 * makes the resolver survive a mid-rollout core rollback (a new-SDK pillar that
 * cached the new path meeting a core instance that no longer serves it): a naive
 * one-shot cache would 404 forever and the pillar would be evicted.
 */
export interface RegistryPathResolver {
  /**
   * Paths to try, in order. Before a winner is cached: `[primary, fallback]`.
   * After {@link remember}: the cached winner first, then the other candidate
   * (still reachable, so a single 404 self-heals in-call).
   */
  candidates(): readonly string[];
  /**
   * Cache the winning path so steady state issues a single request. Only the
   * primary or fallback this resolver was created with is a valid winner; any
   * other path is ignored and leaves the cached hint untouched.
   */
  remember(path: string): void;
  /** Drop the cached winner so the next call re-tries both candidates. */
  invalidate(): void;
}

/**
 * Create a {@link RegistryPathResolver} for one logical operation.
 *
 * @param primary - the canonical (new, preferred) path
 * @param fallback - the legacy path tried when the primary 404s
 */
export function createPathResolver(primary: string, fallback: string): RegistryPathResolver {
  let resolved: string | undefined;
  return {
    candidates(): readonly string[] {
      if (resolved === undefined) return [primary, fallback];
      return resolved === primary ? [primary, fallback] : [fallback, primary];
    },
    remember(path: string): void {
      if (path !== primary && path !== fallback) return;
      resolved = path;
    },
    invalidate(): void {
      resolved = undefined;
    },
  };
}

/**
 * A {@link RegistryPathResolver} bundled with the cross-call "is a winner
 * cached?" flag that {@link resolveWithFallback} needs to self-heal. Create one
 * per logical operation (register / heartbeat / snapshot …) and reuse it across
 * calls so the winning path is cached between requests.
 */
export interface ResolverLeg {
  readonly resolver: RegistryPathResolver;
  hadHint: boolean;
}

/** Build a fresh {@link ResolverLeg} for the `primary`/`fallback` pair. */
export function createResolverLeg(primary: string, fallback: string): ResolverLeg {
  return { resolver: createPathResolver(primary, fallback), hadHint: false };
}

/** A request against ONE registry path that resolves on 2xx or rejects. */
export type PathRequest<T> = (path: string) => Promise<T>;

/**
 * Run one logical registry operation across the leg's candidate paths with the
 * self-healing slash-first / legacy-fallback policy (the single implementation
 * shared by the transport and both discovery readers).
 *
 * Order of behavior per candidate, in `leg.resolver.candidates()` order:
 *  - 2xx → {@link RegistryPathResolver.remember} the winner, set the hint, return.
 *  - 404 against the FIRST candidate when a winner was cached on a prior call →
 *    {@link RegistryPathResolver.invalidate} the hint (so the cycle self-heals
 *    after a core rollback) and fall through to the next candidate IN THIS call.
 *  - 404 against a later candidate → fall through to the next candidate.
 *  - 404 from the LAST candidate → rethrow (caller surfaces the normal error).
 *  - any non-404 error (5xx / network) → rethrow IMMEDIATELY without trying the
 *    next candidate ("up but broken" is not "path unknown").
 *
 * @param leg - the resolver + cross-call hint flag for this operation
 * @param isNotFound - predicate identifying a 404 from the rejection `send` threw
 * @param send - issues the request against a single path
 */
export async function resolveWithFallback<T>(
  leg: ResolverLeg,
  isNotFound: (err: unknown) => boolean,
  send: PathRequest<T>
): Promise<T> {
  const candidates = leg.resolver.candidates();
  let firstError: unknown;
  let firstSet = false;
  for (let index = 0; index < candidates.length; index += 1) {
    const path = candidates[index] ?? '';
    const isLast = index === candidates.length - 1;
    try {
      const value = await send(path);
      leg.resolver.remember(path);
      leg.hadHint = true;
      return value;
    } catch (err) {
      if (!isNotFound(err) || isLast) throw err;
      if (index === 0 && leg.hadHint) {
        leg.resolver.invalidate();
        leg.hadHint = false;
      }
      if (!firstSet) {
        firstError = err;
        firstSet = true;
      }
    }
  }
  throw firstError ?? new Error('registry path resolver had no candidates');
}
