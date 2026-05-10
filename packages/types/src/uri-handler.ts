/**
 * URI handler descriptor — per-module hook for the platform-wide URI resolver
 * (ADR-012, PRD-101 US-08). A module declares the object types it owns under
 * the `pops:{moduleId}/{type}/{...}` namespace and provides a resolver that
 * the central dispatcher calls when a URI matching one of those types is
 * requested.
 *
 * The resolver is intentionally generic over its successful payload (`TData`,
 * defaulting to `unknown`). The platform consumer (US-08) is the only piece
 * that erases it; per-module call sites can keep their narrow type.
 */

/**
 * Outcome of a URI resolution.
 *
 * Discriminated union — the caller dispatches on `kind`:
 * - `object`        — a real entity was found; `data` holds the typed payload
 * - `not-found`     — the module is installed but no entity matches the id
 * - `module-absent` — the owning module is not in `POPS_APPS`/`POPS_OVERLAYS`;
 *                    the resolver was invoked anyway and is reporting back so
 *                    the caller can render a placeholder rather than throw.
 */
export type UriResolution<TData = unknown> =
  | { kind: 'object'; data: TData }
  | { kind: 'not-found' }
  | { kind: 'module-absent' };

export interface UriHandlerDescriptor<TData = unknown> {
  /**
   * Object types this module owns, e.g. `['transaction', 'budget']`.
   * Matched against the second segment of `pops:{moduleId}/{type}/{id}`.
   * Two manifests declaring the same `(moduleId, type)` pair is a contract
   * violation and the registry build (US-02) fails fast.
   */
  types: readonly string[];
  /**
   * Resolves a `(type, id)` pair to a `UriResolution`. The resolver MUST NOT
   * throw on missing data — return `{ kind: 'not-found' }` instead. Throwing
   * is reserved for hard failures (corrupt store, transport error).
   */
  resolve: (type: string, id: string) => Promise<UriResolution<TData>>;
}
