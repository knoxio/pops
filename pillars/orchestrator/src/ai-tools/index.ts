/**
 * Orchestrator AI-tool registry handler. See
 * `pillars/orchestrator/docs/prds/ai-tool-registry`.
 *
 * The orchestrator hosts the aggregated AI-tool registry; the aggregation
 * itself lives in the SDK. `@pops/pillar-sdk`'s `buildToolList()` pulls the
 * current registry snapshot from the shared discovery cache, projects each
 * registered pillar's `manifest.ai.tools` slot into a flat list, and drops
 * pillars that aren't healthy. This module wires that aggregation onto an
 * HTTP surface and nothing more — it deliberately does not reimplement the
 * projection.
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
 * An empty list is also a valid steady state: a pillar that ships no
 * `ai.tools` descriptors contributes nothing to the projection.
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
