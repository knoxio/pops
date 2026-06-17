/**
 * Consolidator worker helpers — scope grouping, cluster utilities, and merge planning.
 * Extracted from consolidator.ts to respect max-lines-per-file.
 */
import { topLevelScope } from './worker-base.js';

import type { EngramService } from '../engrams/service.js';
import type { Engram } from '../engrams/types.js';
import type { ConsolidatePayload } from './types.js';

/** Group engrams by their top-level scope for scope-isolated clustering. */
export function groupByTopLevelScope(engrams: Engram[]): Map<string, Engram[]> {
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
export function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** BFS traversal to collect a connected component from an adjacency map. */
export function bfsComponent(
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

/** Build a merge plan from a cluster of similar engrams. */
export function buildMergePlan(
  cluster: Engram[],
  scope: string,
  engramService: EngramService
): ConsolidatePayload {
  const allTags = dedupe(cluster.flatMap((e) => e.tags));
  const clusterIds = new Set(cluster.map((e) => e.id));
  const allLinks = dedupe(cluster.flatMap((e) => e.links).filter((link) => !clusterIds.has(link)));
  const mergedTitle = `Consolidated: ${cluster[0]?.title ?? 'Untitled'}${cluster.length > 1 ? ` (+${cluster.length - 1} related)` : ''}`;

  const bodyParts = cluster.map((e) => {
    const { body } = engramService.read(e.id);
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

/** Find the most common type within a cluster of engrams. */
export function findDominantType(cluster: Engram[]): string {
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
