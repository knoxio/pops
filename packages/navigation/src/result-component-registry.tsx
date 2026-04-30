import type { ComponentType } from 'react';

/** Base search-context fields injected by the engine into every hit's data object. */
export interface SearchHitMeta {
  /** Raw query string for match highlighting. */
  _query?: string;
  /** Which field matched (e.g. "description", "name"). */
  _matchField?: string;
  /** How the match was found: "exact", "prefix", or "contains". */
  _matchType?: string;
}

/**
 * Props passed to a typed result component.
 *
 * `T` is the domain-specific hit-data shape.  The engine merges
 * `SearchHitMeta` fields into `data` at render time, so every concrete
 * `HitData` type automatically receives `_query`, `_matchField`, and
 * `_matchType`.
 */
export interface ResultComponentProps<T = Record<string, unknown>> {
  data: T & SearchHitMeta;
}

/** A React component that renders a single search result. */
export type ResultComponent = ComponentType<ResultComponentProps<Record<string, unknown>>>;

/** Generic fallback — renders the first string field found in `data`. */
export function GenericResultComponent({ data }: ResultComponentProps) {
  const title = Object.values(data).find((v) => typeof v === 'string') ?? '';
  return <span>{title}</span>;
}

const registry = new Map<string, ResultComponent>();

/**
 * Register a typed ResultComponent for a given domain.
 *
 * The generic parameter `T` is the domain-specific hit-data shape.
 * The engine's internal registry stores components as `ResultComponent`
 * (i.e. `ComponentType<{ data: Record<string, unknown> & SearchHitMeta }>`),
 * so the cast here is safe — at runtime the engine always passes an object
 * that satisfies `T & SearchHitMeta`.
 */
export function registerResultComponent<T>(
  domain: string,
  component: ComponentType<ResultComponentProps<T>>
): void {
  registry.set(domain, component as unknown as ResultComponent);
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
