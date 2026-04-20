import { homeInventory, itemConnections } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { GraphData, GraphEdge, GraphNode } from './types.js';

type AdjacencyEntry = { neighborId: string; itemAId: string; itemBId: string };
type AdjacencyMap = Map<string, AdjacencyEntry[]>;

function buildAdjacency(connections: { itemAId: string; itemBId: string }[]): AdjacencyMap {
  const adjacency: AdjacencyMap = new Map();
  for (const conn of connections) {
    if (!adjacency.has(conn.itemAId)) adjacency.set(conn.itemAId, []);
    if (!adjacency.has(conn.itemBId)) adjacency.set(conn.itemBId, []);
    adjacency.get(conn.itemAId)?.push({
      neighborId: conn.itemBId,
      itemAId: conn.itemAId,
      itemBId: conn.itemBId,
    });
    adjacency.get(conn.itemBId)?.push({
      neighborId: conn.itemAId,
      itemAId: conn.itemAId,
      itemBId: conn.itemBId,
    });
  }
  return adjacency;
}

interface BfsState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  visitedNodes: Set<string>;
  visitedEdges: Set<string>;
  queue: { nodeId: string; depth: number }[];
}

function visitNeighbors(
  state: BfsState,
  neighbors: AdjacencyEntry[],
  itemMap: Map<string, GraphNode>,
  depth: number
): void {
  for (const { neighborId, itemAId, itemBId } of neighbors) {
    const edgeKey = `${itemAId}-${itemBId}`;
    if (!state.visitedEdges.has(edgeKey)) {
      state.visitedEdges.add(edgeKey);
      state.edges.push({ source: itemAId, target: itemBId });
    }

    if (state.visitedNodes.has(neighborId)) continue;
    state.visitedNodes.add(neighborId);

    const neighbor = itemMap.get(neighborId);
    if (!neighbor) continue;
    state.nodes.push(neighbor);
    state.queue.push({ nodeId: neighborId, depth: depth + 1 });
  }
}

export function getConnectionGraph(itemId: string, maxDepth: number): GraphData {
  const db = getDrizzle();
  const allConnections = db.select().from(itemConnections).all();
  const allItems = db
    .select({
      id: homeInventory.id,
      itemName: homeInventory.itemName,
      assetId: homeInventory.assetId,
      type: homeInventory.type,
    })
    .from(homeInventory)
    .all();

  const itemMap = new Map(allItems.map((item) => [item.id, item]));
  const adjacency = buildAdjacency(allConnections);

  const startItem = itemMap.get(itemId);
  if (!startItem) throw new NotFoundError('Inventory item', itemId);

  const state: BfsState = {
    nodes: [startItem],
    edges: [],
    visitedNodes: new Set<string>([itemId]),
    visitedEdges: new Set<string>(),
    queue: [{ nodeId: itemId, depth: 0 }],
  };

  while (state.queue.length > 0) {
    const entry = state.queue.shift();
    if (!entry) break;
    if (entry.depth >= maxDepth) continue;
    visitNeighbors(state, adjacency.get(entry.nodeId) ?? [], itemMap, entry.depth);
  }

  return { nodes: state.nodes, edges: state.edges };
}
