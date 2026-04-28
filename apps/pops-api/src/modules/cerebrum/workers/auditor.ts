/**
 * Auditor Worker (US-04, PRD-085).
 *
 * Scores engram quality, detects contradictions within scopes, and identifies
 * coverage gaps. The auditor is read-only — it surfaces issues but never
 * modifies engrams directly.
 */
import {
  buildTagSharedPairs,
  computeQualityScore,
  generateSuggestions,
} from './auditor-helpers.js';
import {
  DEFAULT_AUDITOR_CONFIG,
  type AuditorConfig,
  type ContradictionPayload,
  type CoverageGapPayload,
  type GliaAction,
  type GliaActionType,
  type LowQualityPayload,
  type QualityResult,
  type TrustPhase,
  type WorkerRunResult,
} from './types.js';
import { WorkerBase, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';

/** Interface for LLM-based contradiction detection. */
export interface ContradictionDetector {
  detectContradiction(bodyA: string, bodyB: string): Promise<string | null>;
}

/** Noop contradiction detector — returns null (no contradictions found). */
class NoopContradictionDetector implements ContradictionDetector {
  async detectContradiction(_bodyA: string, _bodyB: string): Promise<string | null> {
    return null;
  }
}

export interface AuditorDeps extends WorkerBaseDeps {
  config?: Partial<AuditorConfig>;
  contradictionDetector?: ContradictionDetector;
}

export class AuditorWorker extends WorkerBase {
  protected readonly actionType: GliaActionType = 'audit';
  private readonly config: AuditorConfig;
  private readonly contradictionDetector: ContradictionDetector;

  constructor(deps: AuditorDeps) {
    super(deps);
    this.config = { ...DEFAULT_AUDITOR_CONFIG, ...deps.config };
    this.contradictionDetector = deps.contradictionDetector ?? new NoopContradictionDetector();
  }

  async run(dryRun = false): Promise<WorkerRunResult> {
    const phase = this.resolvePhase(dryRun);
    const engrams = this.listActiveEngrams();
    const { qualityActions, processed, skipped } = this.scoreQuality(engrams, phase);
    const contradictionActions = await this.detectContradictions(engrams, phase);
    const gapActions = this.detectCoverageGaps(engrams, phase);
    return {
      actions: [...qualityActions, ...contradictionActions, ...gapActions],
      processed,
      skipped,
    };
  }

  /** Compute the quality score for a single engram (public API). */
  computeQuality(engram: Engram): QualityResult {
    return computeQualityScore(engram, this.engramService);
  }

  private scoreQuality(
    engrams: Engram[],
    phase: TrustPhase
  ): { qualityActions: GliaAction[]; processed: number; skipped: number } {
    const qualityActions: GliaAction[] = [];
    let processed = 0;
    let skipped = 0;
    for (const engram of engrams) {
      processed++;
      const result = this.computeQuality(engram);
      if (result.score >= this.config.qualityThreshold) {
        skipped++;
        continue;
      }
      qualityActions.push(this.buildLowQualityAction(engram, result, phase));
    }
    return { qualityActions, processed, skipped };
  }

  private buildLowQualityAction(
    engram: Engram,
    result: QualityResult,
    phase: TrustPhase
  ): GliaAction {
    const suggestions = generateSuggestions(engram, result);
    const payload: LowQualityPayload = {
      type: 'low_quality',
      score: result.score,
      factors: result.factors,
      suggestions,
    };
    const action = this.createAction(
      [engram.id],
      `Low quality score (${result.score.toFixed(2)}): ${suggestions.join('; ')}`,
      payload,
      phase
    );
    if (phase !== 'propose') action.status = 'executed';
    return action;
  }

  private async detectContradictions(engrams: Engram[], phase: TrustPhase): Promise<GliaAction[]> {
    const pairs = buildTagSharedPairs(engrams);
    const actions: GliaAction[] = [];
    for (const [a, b] of pairs) {
      const action = await this.comparePair(a, b, phase);
      if (action) actions.push(action);
    }
    return actions;
  }

  private async comparePair(a: Engram, b: Engram, phase: TrustPhase): Promise<GliaAction | null> {
    try {
      const bodyA = this.engramService.read(a.id).body;
      const bodyB = this.engramService.read(b.id).body;
      const conflict = await this.contradictionDetector.detectContradiction(bodyA, bodyB);
      if (!conflict) return null;
      return this.buildContradictionAction(a, b, phase, conflict);
    } catch {
      return this.buildContradictionAction(a, b, phase);
    }
  }

  private buildContradictionAction(
    a: Engram,
    b: Engram,
    phase: TrustPhase,
    conflict?: string
  ): GliaAction {
    const isError = conflict === undefined;
    const summary = conflict ?? 'Comparison failed — will retry on next run';
    const payload: ContradictionPayload = {
      type: 'contradiction',
      engramA: a.id,
      engramB: b.id,
      conflictSummary: summary,
    };
    const rationale = isError
      ? `Contradiction check failed for "${a.title}" and "${b.title}"`
      : `Contradiction detected between "${a.title}" and "${b.title}": ${conflict}`;
    const action = this.createAction([a.id, b.id], rationale, payload, phase);
    if (isError) {
      action.status = 'error';
    } else if (phase !== 'propose') {
      action.status = 'executed';
    }
    return action;
  }

  private detectCoverageGaps(engrams: Engram[], phase: TrustPhase): GliaAction[] {
    const tagCounts = new Map<string, { count: number; engramIds: string[] }>();
    for (const engram of engrams) {
      for (const tag of engram.tags) {
        const entry = tagCounts.get(tag) ?? { count: 0, engramIds: [] };
        entry.count++;
        entry.engramIds.push(engram.id);
        tagCounts.set(tag, entry);
      }
    }
    const actions: GliaAction[] = [];
    for (const [tag, { count, engramIds }] of tagCounts) {
      if (count >= this.config.minEngramsPerTopic) continue;
      const payload: CoverageGapPayload = {
        type: 'gap',
        topic: tag,
        existingCount: count,
        relatedEngrams: engramIds,
      };
      const action = this.createAction(
        engramIds,
        `Coverage gap: topic '${tag}' has only ${count} engram(s) (minimum: ${this.config.minEngramsPerTopic})`,
        payload,
        phase
      );
      if (phase !== 'propose') action.status = 'executed';
      actions.push(action);
    }
    return actions;
  }
}
