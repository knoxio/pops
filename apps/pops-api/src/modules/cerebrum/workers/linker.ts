import {
  DEFAULT_LINKER_CONFIG,
  type GliaAction,
  type GliaActionType,
  type LinkerConfig,
  type LinkPayload,
  type WorkerRunResult,
} from './types.js';
/**
 * Linker Worker (US-03, PRD-085).
 *
 * Scans engrams with fewer than N outbound links, finds semantically similar
 * engrams with shared entities, and proposes bidirectional links. Respects
 * scope boundaries and avoids duplicate links.
 */
import { WorkerBase, shareTopLevelScope, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';
import type { RetrievalResult } from '../retrieval/types.js';

/** Shared context for evaluating link candidates within a single run. */
interface LinkEvalContext {
  allEngrams: Engram[];
  phase: string;
  proposedPairs: Set<string>;
}

export interface LinkerDeps extends WorkerBaseDeps {
  config?: Partial<LinkerConfig>;
}

/** Check if a link already exists between two engrams (in either direction). */
function linkExists(source: Engram, targetId: string, allEngrams: Engram[]): boolean {
  if (source.links.includes(targetId)) return true;
  const target = allEngrams.find((e) => e.id === targetId);
  return target ? target.links.includes(source.id) : false;
}

/** Build a reason string describing why two engrams should be linked. */
function buildLinkReason(
  source: Engram,
  target: Engram,
  similarity: number,
  sharedTags: string[]
): string {
  const parts: string[] = [];
  if (similarity > 0) parts.push(`semantic similarity: ${similarity.toFixed(2)}`);
  if (sharedTags.length > 0) parts.push(`shared tags: ${sharedTags.join(', ')}`);
  return `"${source.title}" and "${target.title}" are related (${parts.join('; ')})`;
}

export class LinkerWorker extends WorkerBase {
  protected readonly actionType: GliaActionType = 'link';
  private readonly config: LinkerConfig;

  constructor(deps: LinkerDeps) {
    super(deps);
    this.config = { ...DEFAULT_LINKER_CONFIG, ...deps.config };
  }

  async run(dryRun = false): Promise<WorkerRunResult> {
    const phase = this.resolvePhase(dryRun);
    const allEngrams = this.listActiveEngrams();
    const candidates = allEngrams.filter((e) => e.links.length < this.config.minLinkThreshold);
    const proposedPairs = new Set<string>();
    const actions: GliaAction[] = [];
    let processed = 0;
    let skipped = 0;

    const ctx: LinkEvalContext = { allEngrams, phase, proposedPairs };
    for (const candidate of candidates) {
      processed++;
      const similar = await this.searchService.similar(candidate.id, { status: ['active'] });
      const result = this.evaluateSimilarResults(candidate, similar, ctx);
      actions.push(...result.actions);
      skipped += result.skipped;
    }
    return { actions, processed, skipped };
  }

  private evaluateSimilarResults(
    candidate: Engram,
    similar: RetrievalResult[],
    ctx: LinkEvalContext
  ): { actions: GliaAction[]; skipped: number } {
    const actions: GliaAction[] = [];
    let proposals = 0;
    let skipped = 0;

    for (const result of similar) {
      if (proposals >= this.config.maxProposalsPerEngram) break;
      const action = this.evaluateCandidate(candidate, result, ctx);
      if (action === 'skip') {
        skipped++;
        continue;
      }
      if (action === null) continue;
      actions.push(action);
      proposals++;
    }
    return { actions, skipped };
  }

  private evaluateCandidate(
    candidate: Engram,
    result: RetrievalResult,
    ctx: LinkEvalContext
  ): GliaAction | 'skip' | null {
    const { allEngrams, phase, proposedPairs } = ctx;
    if (result.sourceType !== 'engram' || result.score < this.config.similarityThreshold)
      return null;
    if (result.sourceId === candidate.id) return null;

    const target = allEngrams.find((e) => e.id === result.sourceId);
    if (!target || !shareTopLevelScope(candidate, target)) return null;
    if (linkExists(candidate, result.sourceId, allEngrams)) return null;

    const pairKey = [candidate.id, result.sourceId].toSorted().join('::');
    if (proposedPairs.has(pairKey)) return null;

    const sourceTags = new Set(candidate.tags);
    const sharedTags = target.tags.filter((tag) => sourceTags.has(tag));
    if (result.score < this.config.similarityThreshold && sharedTags.length === 0) return 'skip';

    const reason = buildLinkReason(candidate, target, result.score, sharedTags);
    const payload: LinkPayload = {
      type: 'link',
      sourceId: candidate.id,
      targetId: result.sourceId,
      reason,
      similarityScore: result.score,
    };
    const action = this.createAction([candidate.id, result.sourceId], reason, payload, phase);
    if (phase !== 'propose') {
      this.engramService.link(candidate.id, result.sourceId);
      this.engramService.link(result.sourceId, candidate.id);
      action.status = 'executed';
    }
    proposedPairs.add(pairKey);
    return action;
  }
}
