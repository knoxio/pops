import type { PillarStatus } from '../discovery/index.js';

/**
 * One AI-callable tool projected from a pillar manifest's `ai.tools` slot
 * (see PRD-200). Carries enough context for the orchestrator to route the
 * invocation back to the owning pillar (`pillar`) and to surface its
 * liveness (`pillarStatus`).
 */
export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  pillar: string;
  pillarStatus: PillarStatus;
};

export type BuildToolListOptions = {
  /**
   * Restrict the result to tools owned by these pillar ids. Unknown ids are
   * silently skipped (the orchestrator sees an empty list, not an error).
   * Omit to include every registered pillar.
   */
  pillars?: readonly string[];
  /**
   * Include tools from pillars whose registry-side status is `unavailable`
   * or `unknown`. Off by default so the AI never sees a tool it can't call.
   * Mostly useful for diagnostics and tests.
   */
  includeUnavailable?: boolean;
};

/**
 * Discriminated result returned by `invokeTool` (PRD-202).
 *
 * The orchestrator branches on `kind` to either thread the tool's output
 * back into the model loop (`ok`), surface a graceful "tool unavailable"
 * message to the AI (`pillar-unavailable`), report a tool-level failure
 * (`tool-error`), or fail closed when the AI hallucinates a tool name
 * that no pillar exposes (`unknown-tool`).
 */
export type ToolResult =
  | { kind: 'ok'; output: unknown }
  | { kind: 'pillar-unavailable'; pillar: string }
  | { kind: 'tool-error'; reason: string }
  | { kind: 'unknown-tool'; toolName: string };

export type InvokeToolOptions = {
  /**
   * Override the per-call deadline. Defaults to 30s per the PRD; the
   * orchestrator can tighten or loosen this per-tool if needed.
   */
  timeoutMs?: number;
};
