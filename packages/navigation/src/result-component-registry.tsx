import type { ComponentType } from "react";

/** Props passed to every result component by the search panel. */
export interface ResultComponentProps {
  data: Record<string, unknown>;
}

/** A React component that renders a single search result. */
export type ResultComponent = ComponentType<ResultComponentProps>;

/** Generic fallback — renders the first string field found in `data`. */
export function GenericResultComponent({ data }: ResultComponentProps) {
  const title =
    (Object.values(data).find((v) => typeof v === "string") as string | undefined) ?? "";
  return <span>{title}</span>;
}

const registry = new Map<string, ResultComponent>();

/**
 * Register a ResultComponent for a given domain.
 * Each app package calls this at load time as a side effect.
 */
export function registerResultComponent(domain: string, component: ResultComponent): void {
  registry.set(domain, component);
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
