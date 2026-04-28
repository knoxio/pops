/**
 * ConsolidationDetector (PRD-084 US-01).
 *
 * Scans the engram corpus for clusters of semantically similar engrams and
 * proposes merging them. Uses Thalamus embedding similarity via the
 * HybridSearchService `similar` method to find candidates, then applies
 * scope-aware clustering to avoid cross-scope consolidation.
 */
import { logger } from '../../../../lib/logger.js';

import type { HybridSearchService } from '../../retrieval/hybrid-search.js';
import type { DetectorResult, EngramSummary, NudgeCandidate, NudgeThresholds } from '../types.js';

/** Extract top-level scope from a scope string (e.g., 'work.projects' -> 'work'). */
function topLevelScope(scope: string): string {
  return scope.split('.')[0] ?? scope;
}

/** Check if two engrams share at least one top-level scope. */
function shareScopeLevel(a: EngramSummary, b: EngramSummary): boolean {
  const aTopScopes = new Set(a.scopes.map(topLevelScope));
  return b.scopes.some((s) => aTopScopes.has(topLevelScope(s)));
}

/** Cluster key: sorted engram IDs joined — used for deduplication. */
function clusterKey(ids: string[]): string {
  return [...ids].toSorted().join('|');
}

/**
 * Build a cluster around a seed engram. Starting from the seed, find all
 * engrams above the similarity threshold that share a top-level scope.
 * Returns the cluster as a set of engram IDs with their pairwise scores.
 */
async function findCluster(
  seed: EngramSummary,
  allEngrams: Map<string, EngramSummary>,
  searchService: HybridSearchService,
  threshold: number
): Promise<{ ids: string[]; avgScore: number }> {
  const results = await searchService.similar(seed.id, {}, 50, threshold);

  const clusterIds = new Set<string>([seed.id]);
  let totalScore = 0;
  let scoreCount = 0;

  for (const result of results) {
    if (result.sourceType !== 'engram') continue;
    const candidate = allEngrams.get(result.sourceId);
    if (!candidate) continue;
    if (candidate.status === 'archived' || candidate.status === 'consolidated') continue;
    if (!shareScopeLevel(seed, candidate)) continue;

    clusterIds.add(result.sourceId);
    totalScore += result.score;
    scoreCount++;
  }

  return {
    ids: [...clusterIds],
    avgScore: scoreCount > 0 ? totalScore / scoreCount : 0,
  };
}

/** Build nudge body describing the cluster. */
function buildClusterBody(
  cluster: string[],
  allEngrams: Map<string, EngramSummary>,
  avgScore: number
): string {
  const lines = cluster.map((id) => {
    const e = allEngrams.get(id);
    return e ? `- **${e.title}** (\`${id}\`)` : `- \`${id}\``;
  });

  return (
    `These ${cluster.length} engrams have high semantic overlap ` +
    `(avg similarity: ${avgScore.toFixed(2)}). ` +
    `Consider consolidating them into a single curated document.\n\n` +
    lines.join('\n')
  );
}

/** Build a short title from the first engram's title. */
function buildClusterTitle(cluster: string[], allEngrams: Map<string, EngramSummary>): string {
  const first = allEngrams.get(cluster[0] ?? '');
  const base = first?.title ?? 'related engrams';
  const suffix = cluster.length > 1 ? ` (+${cluster.length - 1} similar)` : '';
  const raw = `Consolidate: ${base}${suffix}`;
  return raw.length > 100 ? raw.slice(0, 97) + '...' : raw;
}

export class ConsolidationDetector {
  private readonly searchService: HybridSearchService;
  private readonly thresholds: NudgeThresholds;

  constructor(searchService: HybridSearchService, thresholds: NudgeThresholds) {
    this.searchService = searchService;
    this.thresholds = thresholds;
  }

  /**
   * Scan all active engrams for consolidation-worthy clusters.
   *
   * Strategy: iterate through each engram, find similar engrams above
   * the threshold, group into clusters, deduplicate overlapping clusters,
   * and return nudge candidates for clusters that meet the minimum size.
   */
  async detect(engrams: EngramSummary[]): Promise<DetectorResult> {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');

    if (active.length < this.thresholds.consolidationMinCluster) {
      return { nudges: [] };
    }

    const engramMap = new Map(active.map((e) => [e.id, e]));
    const seenClusters = new Set<string>();
    const assignedEngrams = new Set<string>();
    const nudges: NudgeCandidate[] = [];

    for (const engram of active) {
      if (assignedEngrams.has(engram.id)) continue;

      let cluster: { ids: string[]; avgScore: number };
      try {
        cluster = await findCluster(
          engram,
          engramMap,
          this.searchService,
          this.thresholds.consolidationSimilarity
        );
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), engramId: engram.id },
          '[ConsolidationDetector] Failed to find cluster for engram'
        );
        continue;
      }

      if (cluster.ids.length < this.thresholds.consolidationMinCluster) continue;

      const key = clusterKey(cluster.ids);
      if (seenClusters.has(key)) continue;
      seenClusters.add(key);

      for (const id of cluster.ids) {
        assignedEngrams.add(id);
      }

      nudges.push({
        type: 'consolidation',
        title: buildClusterTitle(cluster.ids, engramMap),
        body: buildClusterBody(cluster.ids, engramMap, cluster.avgScore),
        engramIds: cluster.ids,
        priority: 'medium',
        expiresAt: null,
        action: {
          type: 'consolidate',
          label: `Merge these ${cluster.ids.length} engrams`,
          params: { engramIds: cluster.ids },
        },
      });
    }

    return { nudges };
  }
}
