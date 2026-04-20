import { and, count, eq, or } from 'drizzle-orm';

/**
 * Item connections service — connect/disconnect inventory items using Drizzle ORM.
 * Enforces A<B ordering to prevent duplicate bidirectional pairs.
 */
import { homeInventory, itemConnections } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { ItemConnectionRow, TraceNode } from './types.js';

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
 * Disconnect two items by their item IDs. Normalises A<B ordering before lookup.
 * Throws NotFoundError if no connection exists between the two items.
 */
export function disconnectItems(inputA: string, inputB: string): void {
  const db = getDrizzle();

  // Enforce A<B ordering (same normalisation as connectItems)
  const [itemAId, itemBId] = inputA < inputB ? [inputA, inputB] : [inputB, inputA];

  const [row] = db
    .select({ id: itemConnections.id })
    .from(itemConnections)
    .where(and(eq(itemConnections.itemAId, itemAId), eq(itemConnections.itemBId, itemBId)))
    .all();

  if (!row) {
    throw new NotFoundError('Item connection', `${itemAId}-${itemBId}`);
  }

  db.delete(itemConnections).where(eq(itemConnections.id, row.id)).run();
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

export { getConnectionGraph } from './graph.js';
