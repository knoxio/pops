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
