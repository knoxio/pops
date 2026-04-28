import {
  DEFAULT_CONSOLIDATOR_CONFIG,
  type ConsolidatePayload,
  type ConsolidatorConfig,
  type GliaAction,
  type GliaActionType,
  type WorkerRunResult,
} from './types.js';
/**
 * Consolidator Worker (US-02, PRD-085).
 *
 * Detects clusters of 3+ engrams with cosine similarity > 0.85 within the
 * same top-level scope. Produces merge plans that combine content, deduplicate
 * tags/links, and archive originals. Large clusters (>10) are split.
 */
import { WorkerBase, topLevelScope, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';

export interface ConsolidatorDeps extends WorkerBaseDeps {
  config?: Partial<ConsolidatorConfig>;
}

/** Group engrams by their top-level scope for scope-isolated clustering. */
function groupByTopLevelScope(engrams: Engram[]): Map<string, Engram[]> {
  const groups = new Map<string, Engram[]>();
  for (const engram of engrams) {
    for (const scope of engram.scopes) {
      const top = topLevelScope(scope);
      const existing = groups.get(top) ?? [];
      if (!existing.some((e) => e.id === engram.id)) {
        existing.push(engram);
        groups.set(top, existing);
      }
    }
  }
  return groups;
}

/** Deduplicate a string array. */
function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Split an array into chunks of at most `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
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
      const component = this.bfsComponent(engram.id, adjacency, visited, engramById);
      if (component.length >= minSize) clusters.push(component);
    }
    return clusters;
  }

  private bfsComponent(
    startId: string,
    adjacency: Map<string, Set<string>>,
    visited: Set<string>,
    engramById: Map<string, Engram>
  ): Engram[] {
    const component: Engram[] = [];
    const queue = [startId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);

      const e = engramById.get(current);
      if (e) component.push(e);

      const neighbours = adjacency.get(current) ?? new Set<string>();
      for (const neighbour of neighbours) {
        if (!visited.has(neighbour)) queue.push(neighbour);
      }
    }
    return component;
  }

  private processCluster(cluster: Engram[], scope: string, phase: string): GliaAction {
    const mergePlan = this.buildMergePlan(cluster, scope);
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

  /** Build a merge plan from a cluster of similar engrams. */
  private buildMergePlan(cluster: Engram[], scope: string): ConsolidatePayload {
    const allTags = dedupe(cluster.flatMap((e) => e.tags));
    const clusterIds = new Set(cluster.map((e) => e.id));
    const allLinks = dedupe(
      cluster.flatMap((e) => e.links).filter((link) => !clusterIds.has(link))
    );
    const mergedTitle = `Consolidated: ${cluster[0]?.title ?? 'Untitled'}${cluster.length > 1 ? ` (+${cluster.length - 1} related)` : ''}`;

    const bodyParts = cluster.map((e) => {
      const { body } = this.engramService.read(e.id);
      return `### From: ${e.title} (${e.id})\n\n${body}`;
    });

    const mergedBody = [
      `# ${mergedTitle}`,
      '',
      ...bodyParts,
      '',
      '## Sources',
      '',
      ...cluster.map((e) => `- ${e.id}: ${e.title}`),
    ].join('\n');

    return {
      type: 'merge',
      clusterIds: [...clusterIds],
      mergedTitle,
      mergedTags: allTags,
      mergedLinks: allLinks,
      mergedBody,
      scope,
    };
  }

  /** Execute a merge — create consolidated engram and archive originals. */
  private executeMerge(cluster: Engram[], plan: ConsolidatePayload): void {
    const dominantType = this.findDominantType(cluster);
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

  private findDominantType(cluster: Engram[]): string {
    const typeCounts = new Map<string, number>();
    for (const e of cluster) {
      typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    }
    let dominant = cluster[0]?.type ?? 'note';
    let maxCount = 0;
    for (const [type, cnt] of typeCounts) {
      if (cnt > maxCount) {
        dominant = type;
        maxCount = cnt;
      }
    }
    return dominant;
  }
}
