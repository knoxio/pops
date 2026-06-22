import type { ComponentType } from 'react';

/**
 * Props passed to every result component by the search panel.
 *
 * `T` is the per-domain hit-data shape produced by the SearchAdapter that
 * registered this component. Defaulting to `Record<string, unknown>` keeps
 * the call site (the search panel) generic — it can dispatch by domain
 * without knowing the concrete shape.
 */
export interface ResultComponentProps<T = Record<string, unknown>> {
  data: T;
  /** Raw query string for match highlighting. */
  query?: string;
  /** Which field matched (e.g. "description", "name"). */
  matchField?: string;
  /** How the match was found: "exact", "prefix", or "contains". */
  matchType?: string;
}

/** A React component that renders a single search result for a given hit shape. */
export type ResultComponent<T = Record<string, unknown>> = ComponentType<ResultComponentProps<T>>;

/** Generic fallback — renders the first string field found in `data`. */
export function GenericResultComponent({ data }: ResultComponentProps) {
  const title = Object.values(data).find((v) => typeof v === 'string') ?? '';
  return <span>{title}</span>;
}

const registry = new Map<string, ResultComponent>();

/**
 * Register a typed `ResultComponent<T>` for a given domain.
 *
 * Each app package calls this at load time as a side effect. `T` lets a
 * component declare the exact `HitData` shape it expects — inside the
 * component, `data` is typed as `T` instead of an opaque record, so no
 * per-field casts are needed.
 *
 * The registry storage erases `T` (the search panel does not — and should
 * not — know each domain's shape), so a single narrowing assignment crosses
 * the boundary here. Runtime safety relies on the contract that the
 * SearchAdapter for `domain` produces hits matching `T`.
 */
export function registerResultComponent<
  T extends Record<string, unknown> = Record<string, unknown>,
>(domain: string, component: ResultComponent<T>): void {
  registry.set(domain, component as ResultComponent);
}

/**
 * Return the ResultComponent for the given domain, or the generic fallback
 * when no component has been registered for that domain.
 */
export function getResultComponent(domain: string): ResultComponent {
  return registry.get(domain) ?? GenericResultComponent;
}

/** @internal — test helper only; clears all registered components. */
export function _clearRegistry(): void {
  registry.clear();
}
