/**
 * Self-healing path resolver for the registry handshake/discovery rollout.
 *
 * Two HTTP paths serve one logical registry operation during the rolling-deploy
 * window: the new slash form ({@link REGISTRY_PATHS}) and the legacy dotted form
 * ({@link LEGACY_REGISTRY_PATHS}). A caller tries {@link RegistryPathResolver.candidates}
 * in order, calls {@link RegistryPathResolver.remember} on the first 200, and
 * calls {@link RegistryPathResolver.invalidate} on a 404 against the cached path.
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
  /** Cache the winning path so steady state issues a single request. */
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
      resolved = path;
    },
    invalidate(): void {
      resolved = undefined;
    },
  };
}
