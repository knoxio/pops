/**
 * Orchestrator AI-tool registry handler (precursor C2 / epic 07).
 *
 * Epic 07's deliverable: the orchestrator HOSTS the aggregated AI-tool
 * registry. The aggregation itself already lives in the SDK —
 * `@pops/pillar-sdk`'s `buildToolList()` (PRD-201) pulls the current
 * registry snapshot from the shared discovery cache (PRD-159), projects
 * each registered pillar's `manifest.ai.tools` slot (PRD-200) into a flat
 * list, and drops pillars that aren't healthy. This module wires that
 * aggregation onto an HTTP surface and nothing more — it deliberately does
 * not reimplement the projection.
 *
 * Registry source: `buildToolList` reads the in-process discovery cache
 * (the same central registry the orchestrator registers itself with via
 * `bootstrapPillar`). It is NOT fed a snapshot from the orchestrator's
 * `POPS_PILLARS` view — that view carries only `{ id, baseUrl }`, not the
 * manifests the projection needs. The discovery cache is the manifest
 * source of truth, so the handler calls `buildToolList()` and lets the SDK
 * own the snapshot.
 *
 * Best-effort: a registry read failure (e.g. `RegistryUnreachableError`
 * on a cold, empty cache) degrades to `{ tools: [] }` rather than a 500.
 * An empty list is also the correct STEADY-STATE result today: no pillar
 * ships PRD-200 `ai.tools` descriptors yet, so the projection is empty
 * until they adopt them. The value delivered now is that the registry is
 * hosted and ready — tools appear as pillars declare them.
 */
import { buildToolList as sdkBuildToolList, type Tool } from '@pops/pillar-sdk';

export type AiToolsResponse = {
  tools: readonly Tool[];
};

/** Aggregator signature — the SDK's `buildToolList`, injectable for tests. */
export type BuildToolList = () => Promise<readonly Tool[]>;

export interface AiToolsHandlerOptions {
  /**
   * Tool-list aggregator. Defaults to the SDK's `buildToolList`, which
   * reads the shared discovery-cache registry snapshot. Injectable so unit
   * tests can stub the projection input without touching SDK internals.
   */
  readonly buildToolList?: BuildToolList;
  /** Warning sink for a degraded (failed) registry read. Defaults to `console.warn`. */
  readonly onWarn?: (message: string, detail?: unknown) => void;
}

/**
 * Build the `GET /ai/tools` handler. Returns the AI-tool registry the SDK
 * projects from pillar manifests, degrading to an empty list on a registry
 * read failure (never throwing to the route).
 */
export function createAiToolsHandler(
  options: AiToolsHandlerOptions = {}
): () => Promise<AiToolsResponse> {
  const build = options.buildToolList ?? sdkBuildToolList;
  const onWarn = options.onWarn ?? defaultWarn;

  return async (): Promise<AiToolsResponse> => {
    try {
      const tools = await build();
      return { tools };
    } catch (err) {
      onWarn('[orchestrator] AI-tool registry read failed; serving empty tool list', err);
      return { tools: [] };
    }
  };
}

function defaultWarn(message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
