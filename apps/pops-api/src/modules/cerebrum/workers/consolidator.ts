/**
 * Consolidator Worker (US-02, PRD-085).
 *
 * Detects clusters of 3+ engrams with cosine similarity > 0.85 within the
 * same top-level scope. Produces merge plans that combine content, deduplicate
 * tags/links, and archive originals. Large clusters (>10) are split.
 */
import {
  bfsComponent,
  buildMergePlan,
  chunk,
  findDominantType,
  groupByTopLevelScope,
} from './consolidator-helpers.js';
import {
  DEFAULT_CONSOLIDATOR_CONFIG,
  type ConsolidatePayload,
  type ConsolidatorConfig,
  type GliaAction,
  type GliaActionType,
  type WorkerRunResult,
} from './types.js';
import { WorkerBase, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';

export interface ConsolidatorDeps extends WorkerBaseDeps {
  config?: Partial<ConsolidatorConfig>;
}

export class ConsolidatorWorker extends WorkerBase {
  protected readonly actionType: GliaActionType = 'consolidate';
  private readonly config: ConsolidatorConfig;

  constructor(deps: ConsolidatorDeps) {
    super(deps);
    this.config = { ...DEFAULT_CONSOLIDATOR_CONFIG, ...deps.config };
  }

  async run(dryRun = false): Promise<WorkerRunResult> {
    const phase = this.resolvePhase(dryRun);
    const engrams = this.listActiveEngrams();
    const scopeGroups = groupByTopLevelScope(engrams);
    const allActions = [];
    let processed = 0;
    let skipped = 0;

    for (const [scope, scopeEngrams] of scopeGroups) {
      const clusters = await this.detectClusters(scopeEngrams);

      for (const rawCluster of clusters) {
        const subClusters =
          rawCluster.length > this.config.maxClusterSize
            ? chunk(rawCluster, this.config.maxClusterSize)
            : [rawCluster];

        for (const cluster of subClusters) {
          processed += cluster.length;
          allActions.push(this.processCluster(cluster, scope, phase));
        }
      }

      const clusteredIds = new Set(allActions.flatMap((a) => a.affectedIds));
      skipped += scopeEngrams.filter((e) => !clusteredIds.has(e.id)).length;
    }

    return { actions: allActions, processed, skipped };
  }

  /** Detect clusters of semantically similar engrams within a scope group. */
  private async detectClusters(engrams: Engram[]): Promise<Engram[][]> {
    if (engrams.length < 3) return [];
    const adjacency = await this.buildAdjacency(engrams);
    return this.findClusters(engrams, adjacency, 3);
  }

  private async buildAdjacency(engrams: Engram[]): Promise<Map<string, Set<string>>> {
    const adjacency = new Map<string, Set<string>>();
    for (const engram of engrams) {
      adjacency.set(engram.id, new Set());
    }

    for (const engram of engrams) {
      const similar = await this.searchService.similar(engram.id, { status: ['active'] });
      for (const result of similar) {
        if (result.sourceType !== 'engram') continue;
        if (result.score < this.config.similarityThreshold) continue;
        if (!adjacency.has(result.sourceId)) continue;
        adjacency.get(engram.id)?.add(result.sourceId);
        adjacency.get(result.sourceId)?.add(engram.id);
      }
    }
    return adjacency;
  }

  /** BFS to find connected components of at least `minSize`. */
  private findClusters(
    engrams: Engram[],
    adjacency: Map<string, Set<string>>,
    minSize: number
  ): Engram[][] {
    const visited = new Set<string>();
    const engramById = new Map(engrams.map((e) => [e.id, e]));
    const clusters: Engram[][] = [];

    for (const engram of engrams) {
      if (visited.has(engram.id)) continue;
      const component = bfsComponent(engram.id, adjacency, visited, engramById);
      if (component.length >= minSize) clusters.push(component);
    }
    return clusters;
  }

  private processCluster(cluster: Engram[], scope: string, phase: string): GliaAction {
    const mergePlan = buildMergePlan(cluster, scope, this.engramService);
    const action = this.createAction(
      cluster.map((e) => e.id),
      `Consolidating ${cluster.length} similar engrams in scope '${scope}': ${cluster.map((e) => `"${e.title}"`).join(', ')}`,
      mergePlan,
      phase
    );
    if (phase !== 'propose') {
      this.executeMerge(cluster, mergePlan);
      action.status = 'executed';
    }
    return action;
  }

  /** Execute a merge — create consolidated engram and archive originals. */
  private executeMerge(cluster: Engram[], plan: ConsolidatePayload): void {
    const dominantType = findDominantType(cluster);
    const merged = this.engramService.create({
      title: plan.mergedTitle,
      body: plan.mergedBody,
      type: dominantType,
      scopes: [plan.scope],
      tags: plan.mergedTags,
      source: 'agent',
    });
    for (const linkTarget of plan.mergedLinks) {
      this.engramService.link(merged.id, linkTarget);
    }
    for (const original of cluster) {
      this.engramService.archive(original.id);
    }
  }
}
