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
 * Outcome of a per-module URI handler resolution. This is the narrow shape a
 * `uriHandler.resolve(type, id)` returns — the central dispatcher (US-08)
 * decorates these into `UriResolverResult` with module/type/id metadata.
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

/**
 * Outcome of the platform-wide URI resolver (PRD-101 US-08, ADR-012).
 *
 * The dispatcher parses a `pops:{moduleId}/{type}/{id}` URI, looks up the
 * owning module, and calls its `uriHandler.resolve`. The result is enriched
 * with the parsed metadata so callers can render type-aware placeholders
 * without re-parsing the URI.
 *
 * - `object`         — handler returned a payload; `moduleId`, `type`, `id`
 *                      are echoed back from the URI for caller convenience.
 * - `not-found`      — owning module is installed but the record/type was
 *                      not found (no handler for type or handler returned
 *                      `not-found`).
 * - `module-absent`  — owning module is not installed in this deployment;
 *                      caller should render a "module not installed"
 *                      placeholder rather than throw.
 * - `pillar-unavailable` — owning pillar IS in the registry but its `/uri/resolve`
 *                      could not be reached (process down, timeout, bad
 *                      gateway). Distinct from `module-absent`: the module is
 *                      configured for this deployment but the process is not
 *                      currently serving. Caller should render a transient
 *                      "pillar offline" placeholder rather than a permanent
 *                      "module not installed" one. Introduced by ADR-026 P2.
 * - `malformed`      — URI did not parse per ADR-012 (wrong prefix, missing
 *                      parts, uppercase characters, etc.); `reason` names
 *                      the specific violation for debugging.
 */
export type UriResolverResult<TData = unknown> =
  | { kind: 'object'; moduleId: string; type: string; id: string; data: TData }
  | { kind: 'not-found'; moduleId: string; type: string; id: string }
  | { kind: 'module-absent'; moduleId: string }
  | { kind: 'pillar-unavailable'; moduleId: string; reason: string }
  | { kind: 'malformed'; uri: string; reason: string };

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
