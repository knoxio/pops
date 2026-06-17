/**
 * Abstract base for Glia curation workers (PRD-085).
 *
 * Provides trust-phase checking, secret-scope filtering, action ID generation,
 * and the common run-loop structure that all four workers share.
 */
import { createHash, randomBytes } from 'node:crypto';

import type { EngramService } from '../engrams/service.js';
import type { Engram } from '../engrams/types.js';
import type { HybridSearchService } from '../retrieval/hybrid-search.js';
import type { GliaAction, GliaActionType, TrustPhase, WorkerRunResult } from './types.js';

/** Minimal interface for the trust phase lookup — stub until PRD-086 lands. */
export interface TrustPhaseProvider {
  getPhase(actionType: GliaActionType): TrustPhase;
}

/** Default trust phase provider — always proposes (safest default). */
export class DefaultTrustPhaseProvider implements TrustPhaseProvider {
  getPhase(_actionType: GliaActionType): TrustPhase {
    return 'propose';
  }
}

/** Check whether an engram's scope list contains a `.secret.` segment. */
export function hasSecretScope(scopes: string[]): boolean {
  return scopes.some((scope) => scope.split('.').includes('secret'));
}

/** Check whether an engram should be skipped by curation workers. */
export function shouldSkipEngram(engram: Engram): boolean {
  if (engram.status === 'archived' || engram.status === 'consolidated') return true;
  return hasSecretScope(engram.scopes);
}

/** Extract top-level scope prefix (first segment before the first dot). */
export function topLevelScope(scope: string): string {
  const dot = scope.indexOf('.');
  return dot === -1 ? scope : scope.slice(0, dot);
}

/** Check if two engrams share at least one top-level scope. */
export function shareTopLevelScope(engramA: Engram, engramB: Engram): boolean {
  const aTopScopes = new Set(engramA.scopes.map(topLevelScope));
  return engramB.scopes.some((scope) => aTopScopes.has(topLevelScope(scope)));
}

export interface WorkerBaseDeps {
  engramService: EngramService;
  searchService: HybridSearchService;
  trustProvider?: TrustPhaseProvider;
  now?: () => Date;
}

/** Resolve a raw phase string to a TrustPhase value. */
function resolveTrustPhase(phase: string): TrustPhase {
  if (phase === 'act_report') return 'act_report';
  if (phase === 'silent') return 'silent';
  return 'propose';
}

export abstract class WorkerBase {
  protected readonly engramService: EngramService;
  protected readonly searchService: HybridSearchService;
  protected readonly trustProvider: TrustPhaseProvider;
  protected readonly now: () => Date;

  constructor(deps: WorkerBaseDeps) {
    this.engramService = deps.engramService;
    this.searchService = deps.searchService;
    this.trustProvider = deps.trustProvider ?? new DefaultTrustPhaseProvider();
    this.now = deps.now ?? (() => new Date());
  }

  /** Run the worker. If dryRun is true, force propose mode regardless of trust phase. */
  abstract run(dryRun?: boolean): Promise<WorkerRunResult>;

  /** The action type this worker produces. */
  protected abstract readonly actionType: GliaActionType;

  /** Resolve the effective trust phase — dryRun forces 'propose'. */
  protected resolvePhase(dryRun: boolean): TrustPhase {
    if (dryRun) return 'propose';
    return this.trustProvider.getPhase(this.actionType);
  }

  /** Generate a unique action ID. */
  protected generateActionId(): string {
    const timestamp = this.now()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    const hash = createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 8);
    return `glia_${this.actionType}_${timestamp}_${hash}`;
  }

  /** Create a GliaAction record. */
  protected createAction(
    affectedIds: string[],
    rationale: string,
    payload: Record<string, unknown>,
    phase: TrustPhase | string
  ): GliaAction {
    return {
      id: this.generateActionId(),
      actionType: this.actionType,
      affectedIds,
      rationale,
      payload,
      phase: resolveTrustPhase(phase),
      status: 'proposed',
      createdAt: this.now().toISOString(),
    };
  }

  /** Fetch all active engrams, filtering out archived/consolidated/secret. */
  protected listActiveEngrams(): Engram[] {
    const { engrams } = this.engramService.list({
      status: 'active',
      limit: 10000,
    });
    return engrams.filter((e) => !shouldSkipEngram(e));
  }
}
