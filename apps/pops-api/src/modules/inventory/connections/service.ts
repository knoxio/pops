/**
 * Item connections service — connect/disconnect inventory items using Drizzle ORM.
 * Enforces A<B ordering to prevent duplicate bidirectional pairs.
 */
import { homeInventory, itemConnections } from '@pops/db-types';
import { and, count, eq, or } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type { GraphData, GraphEdge, GraphNode, ItemConnectionRow, TraceNode } from './types.js';

/** Count + rows for a paginated list. */
export interface ConnectionListResult {
  rows: ItemConnectionRow[];
  total: number;
}

/**
 * Connect two inventory items. Enforces itemAId < itemBId ordering.
 * Validates both items exist. Throws ConflictError on duplicate.
 */
export function connectItems(inputA: string, inputB: string): ItemConnectionRow {
  const db = getDrizzle();

  if (inputA === inputB) {
    throw new ConflictError('Cannot connect an item to itself');
  }

  // Enforce A<B ordering
  const [itemAId, itemBId] = inputA < inputB ? [inputA, inputB] : [inputB, inputA];

  // Validate both items exist
  const [itemA] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemAId))
    .all();
  if (!itemA) throw new NotFoundError('Inventory item', itemAId);

  const [itemB] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemBId))
    .all();
  if (!itemB) throw new NotFoundError('Inventory item', itemBId);

  // Check for existing connection
  const [existing] = db
    .select({ id: itemConnections.id })
    .from(itemConnections)
    .where(and(eq(itemConnections.itemAId, itemAId), eq(itemConnections.itemBId, itemBId)))
    .all();

  if (existing) {
    throw new ConflictError(`Connection between '${itemAId}' and '${itemBId}' already exists`);
  }

  db.insert(itemConnections).values({ itemAId, itemBId }).run();

  // Fetch the created row
  const [created] = db
    .select()
    .from(itemConnections)
    .where(and(eq(itemConnections.itemAId, itemAId), eq(itemConnections.itemBId, itemBId)))
    .all();

  if (!created) throw new NotFoundError('Item connection', `${itemAId}-${itemBId}`);
  return created;
}

/**
 * Disconnect two items by connection ID. Throws NotFoundError if missing.
 */
export function disconnectItems(id: number): void {
  const db = getDrizzle();

  const [row] = db
    .select({ id: itemConnections.id })
    .from(itemConnections)
    .where(eq(itemConnections.id, id))
    .all();

  if (!row) throw new NotFoundError('Item connection', String(id));

  db.delete(itemConnections).where(eq(itemConnections.id, id)).run();
}

/**
 * List all connections for a given item (checking both A and B columns).
 */
export function listConnectionsForItem(
  itemId: string,
  limit: number,
  offset: number
): ConnectionListResult {
  const db = getDrizzle();

  const condition = or(eq(itemConnections.itemAId, itemId), eq(itemConnections.itemBId, itemId));

  const rows = db.select().from(itemConnections).where(condition).limit(limit).offset(offset).all();

  const [countResult] = db.select({ total: count() }).from(itemConnections).where(condition).all();

  return { rows, total: countResult?.total ?? 0 };
}

/**
 * Trace the full connection graph from a starting item as a tree.
 * Uses BFS to avoid stack overflow on deep graphs. Handles circular
 * references by tracking visited nodes.
 */
export function traceConnections(itemId: string, maxDepth: number): TraceNode {
  const db = getDrizzle();

  // Validate the starting item exists
  const [startItem] = db
    .select({
      id: homeInventory.id,
      itemName: homeInventory.itemName,
      assetId: homeInventory.assetId,
      type: homeInventory.type,
    })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();

  if (!startItem) throw new NotFoundError('Inventory item', itemId);

  const root: TraceNode = {
    id: startItem.id,
    itemName: startItem.itemName,
    assetId: startItem.assetId,
    type: startItem.type,
    children: [],
  };

  const visited = new Set<string>([itemId]);
  const queue: { node: TraceNode; depth: number }[] = [{ node: root, depth: 0 }];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const { node, depth } = entry;
    if (depth >= maxDepth) continue;

    // Find all connections for this node
    const connections = db
      .select()
      .from(itemConnections)
      .where(or(eq(itemConnections.itemAId, node.id), eq(itemConnections.itemBId, node.id)))
      .all();

    for (const conn of connections) {
      const neighborId = conn.itemAId === node.id ? conn.itemBId : conn.itemAId;
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const [neighbor] = db
        .select({
          id: homeInventory.id,
          itemName: homeInventory.itemName,
          assetId: homeInventory.assetId,
          type: homeInventory.type,
        })
        .from(homeInventory)
        .where(eq(homeInventory.id, neighborId))
        .all();

      if (!neighbor) continue;

      const childNode: TraceNode = {
        id: neighbor.id,
        itemName: neighbor.itemName,
        assetId: neighbor.assetId,
        type: neighbor.type,
        children: [],
      };

      node.children.push(childNode);
      queue.push({ node: childNode, depth: depth + 1 });
    }
  }

  return root;
}

/**
 * Get the connection subgraph for an item as flat nodes + edges.
 * Pre-fetches all connections and items to avoid N+1 queries,
 * then performs BFS in-memory.
 */
export function getConnectionGraph(itemId: string, maxDepth: number): GraphData {
  const db = getDrizzle();

  // Pre-fetch all connections and items in 2 bulk queries
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

  // Build lookup maps
  const itemMap = new Map(allItems.map((item) => [item.id, item]));

  // Build adjacency list: itemId -> list of { neighborId, conn }
  const adjacency = new Map<string, { neighborId: string; itemAId: string; itemBId: string }[]>();
  for (const conn of allConnections) {
    if (!adjacency.has(conn.itemAId)) adjacency.set(conn.itemAId, []);
    if (!adjacency.has(conn.itemBId)) adjacency.set(conn.itemBId, []);
    const entryA = { neighborId: conn.itemBId, itemAId: conn.itemAId, itemBId: conn.itemBId };
    const entryB = { neighborId: conn.itemAId, itemAId: conn.itemAId, itemBId: conn.itemBId };
    const listA = adjacency.get(conn.itemAId);
    const listB = adjacency.get(conn.itemBId);
    if (listA) listA.push(entryA);
    if (listB) listB.push(entryB);
  }

  // Validate starting item
  const startItem = itemMap.get(itemId);
  if (!startItem) throw new NotFoundError('Inventory item', itemId);

  const nodes: GraphNode[] = [startItem];
  const edges: GraphEdge[] = [];
  const visitedNodes = new Set<string>([itemId]);
  const visitedEdges = new Set<string>();
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: itemId, depth: 0 }];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const { nodeId, depth } = entry;
    if (depth >= maxDepth) continue;

    const neighbors = adjacency.get(nodeId) ?? [];

    for (const { neighborId, itemAId, itemBId } of neighbors) {
      // Always add the edge (already normalized to A<B by DB constraint)
      const edgeKey = `${itemAId}-${itemBId}`;
      if (!visitedEdges.has(edgeKey)) {
        visitedEdges.add(edgeKey);
        edges.push({ source: itemAId, target: itemBId });
      }

      // Only add unvisited nodes to the queue
      if (visitedNodes.has(neighborId)) continue;
      visitedNodes.add(neighborId);

      const neighbor = itemMap.get(neighborId);
      if (!neighbor) continue;

      nodes.push(neighbor);
      queue.push({ nodeId: neighborId, depth: depth + 1 });
    }
  }

  return { nodes, edges };
}
