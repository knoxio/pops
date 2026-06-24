/**
 * ConsolidationDetector (see pillars/cerebrum/docs/prds/proactive-nudges).
 *
 * Scans the engram corpus for clusters of semantically similar engrams and
 * proposes merging them. Uses embedding similarity via the in-pillar
 * {@link HybridSearchService.similar} to find candidates, then applies
 * scope-aware clustering so cross-scope engrams are never consolidated.
 */
import type { HybridSearchService } from '../../retrieval/hybrid-search.js';
import type { DetectorResult, EngramSummary, NudgeCandidate, NudgeThresholds } from '../types.js';

function topLevelScope(scope: string): string {
  return scope.split('.')[0] ?? scope;
}

function shareScopeLevel(a: EngramSummary, b: EngramSummary): boolean {
  const aTopScopes = new Set(a.scopes.map(topLevelScope));
  return b.scopes.some((s) => aTopScopes.has(topLevelScope(s)));
}

function clusterKey(ids: string[]): string {
  return [...ids].toSorted().join('|');
}

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

  return { ids: [...clusterIds], avgScore: scoreCount > 0 ? totalScore / scoreCount : 0 };
}

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

function buildClusterTitle(cluster: string[], allEngrams: Map<string, EngramSummary>): string {
  const first = allEngrams.get(cluster[0] ?? '');
  const base = first?.title ?? 'related engrams';
  const suffix = cluster.length > 1 ? ` (+${cluster.length - 1} similar)` : '';
  const raw = `Consolidate: ${base}${suffix}`;
  return raw.length > 100 ? raw.slice(0, 97) + '...' : raw;
}

function buildCandidate(
  cluster: { ids: string[]; avgScore: number },
  engramMap: Map<string, EngramSummary>
): NudgeCandidate {
  return {
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
  };
}

export class ConsolidationDetector {
  private readonly searchService: HybridSearchService;
  private readonly thresholds: NudgeThresholds;

  constructor(searchService: HybridSearchService, thresholds: NudgeThresholds) {
    this.searchService = searchService;
    this.thresholds = thresholds;
  }

  async detect(engrams: EngramSummary[]): Promise<DetectorResult> {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');
    if (active.length < this.thresholds.consolidationMinCluster) return { nudges: [] };

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
        console.warn(
          `[cerebrum-nudges] consolidation cluster failed for ${engram.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        continue;
      }

      if (cluster.ids.length < this.thresholds.consolidationMinCluster) continue;

      const key = clusterKey(cluster.ids);
      if (seenClusters.has(key)) continue;
      seenClusters.add(key);

      for (const id of cluster.ids) assignedEngrams.add(id);
      nudges.push(buildCandidate(cluster, engramMap));
    }

    return { nudges };
  }
}
