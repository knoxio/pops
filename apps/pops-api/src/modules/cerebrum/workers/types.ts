/**
 * Shared types for the Glia curation workers (PRD-085).
 *
 * All four workers (pruner, consolidator, linker, auditor) produce GliaAction
 * records that flow through the trust graduation system (PRD-086).
 */

/** Trust phases that govern worker execution behaviour. */
export type TrustPhase = 'propose' | 'act_report' | 'silent';

/** Action types corresponding to the four curation workers. */
export type GliaActionType = 'prune' | 'consolidate' | 'link' | 'audit';

/** Status of a glia action through its lifecycle. */
export type GliaActionStatus = 'proposed' | 'executed' | 'error';

/**
 * A uniform action record produced by any curation worker.
 * Consumed by the trust graduation system (PRD-086).
 */
export interface GliaAction {
  /** Unique action ID: `glia_{action_type}_{timestamp}_{short_hash}` */
  id: string;
  /** Which worker produced this action. */
  actionType: GliaActionType;
  /** Engram IDs affected by this action. */
  affectedIds: string[];
  /** Human-readable explanation of why this action is proposed. */
  rationale: string;
  /** Action-type-specific data (merge plan, link pairs, quality scores, etc.). */
  payload: Record<string, unknown>;
  /** Trust phase at time of creation. */
  phase: TrustPhase;
  /** Current status of the action. */
  status: GliaActionStatus;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Staleness score breakdown for a single engram (Pruner). */
export interface StalenessFactors {
  daysSinceModified: number;
  daysSinceReferenced: number;
  inboundLinkCount: number;
  queryHitCount: number;
}

export interface StalenessResult {
  score: number;
  factors: StalenessFactors;
}

/** Quality score breakdown for a single engram (Auditor). */
export interface QualityFactors {
  completeness: number;
  specificity: number;
  templateFit: number;
  linkDensity: number;
}

export interface QualityResult {
  score: number;
  factors: QualityFactors;
}

/** Base index signature for payloads to satisfy Record<string, unknown>. */
interface PayloadBase {
  [key: string]: unknown;
}

/** Pruner-specific payload. */
export interface PrunePayload extends PayloadBase {
  type: 'archive';
  stalenessScore: number;
  factors: StalenessFactors;
  isOrphan: boolean;
}

/** Consolidator-specific payload. */
export interface ConsolidatePayload extends PayloadBase {
  type: 'merge';
  clusterIds: string[];
  mergedTitle: string;
  mergedTags: string[];
  mergedLinks: string[];
  mergedBody: string;
  scope: string;
}

/** Linker-specific payload. */
export interface LinkPayload extends PayloadBase {
  type: 'link';
  sourceId: string;
  targetId: string;
  reason: string;
  similarityScore: number;
}

/** Auditor-specific payloads. */
export interface ContradictionPayload extends PayloadBase {
  type: 'contradiction';
  engramA: string;
  engramB: string;
  conflictSummary: string;
}

export interface LowQualityPayload extends PayloadBase {
  type: 'low_quality';
  score: number;
  factors: QualityFactors;
  suggestions: string[];
}

export interface CoverageGapPayload extends PayloadBase {
  type: 'gap';
  topic: string;
  existingCount: number;
  relatedEngrams: string[];
}

export type AuditPayload = ContradictionPayload | LowQualityPayload | CoverageGapPayload;

/** Result summary returned by each worker's run method. */
export interface WorkerRunResult {
  actions: GliaAction[];
  processed: number;
  skipped: number;
}

/** Configuration for the pruner worker. */
export interface PrunerConfig {
  stalenessThreshold: number;
  orphanThreshold: number;
  orphanDays: number;
  batchSize: number;
}

/** Configuration for the consolidator worker. */
export interface ConsolidatorConfig {
  similarityThreshold: number;
  maxClusterSize: number;
}

/** Configuration for the linker worker. */
export interface LinkerConfig {
  minLinkThreshold: number;
  similarityThreshold: number;
  maxProposalsPerEngram: number;
}

/** Configuration for the auditor worker. */
export interface AuditorConfig {
  qualityThreshold: number;
  minEngramsPerTopic: number;
}

/** Default configurations — these would be read from glia.toml in production. */
export const DEFAULT_PRUNER_CONFIG: PrunerConfig = {
  stalenessThreshold: 0.7,
  orphanThreshold: 0.5,
  orphanDays: 90,
  batchSize: 100,
};

export const DEFAULT_CONSOLIDATOR_CONFIG: ConsolidatorConfig = {
  similarityThreshold: 0.85,
  maxClusterSize: 10,
};

export const DEFAULT_LINKER_CONFIG: LinkerConfig = {
  minLinkThreshold: 2,
  similarityThreshold: 0.7,
  maxProposalsPerEngram: 5,
};

export const DEFAULT_AUDITOR_CONFIG: AuditorConfig = {
  qualityThreshold: 0.3,
  minEngramsPerTopic: 2,
};
