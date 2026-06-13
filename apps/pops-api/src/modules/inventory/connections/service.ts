/**
 * Inventory connections read/write surface — PRD-175 PR 2 cutover.
 *
 * Read/write split during the migration window (mirrors PRD-173 PR 2 +
 * PRD-179 PR 2):
 *  - `listConnectionsForItem`, `traceConnections`, and `getConnectionGraph`
 *    are routed through `connectionsService` from `@pops/inventory-db`
 *    against the inventory pillar handle (`getInventoryDrizzle()`). Reads
 *    now resolve from the canonical package implementation.
 *  - Writes (`connectItems`, `disconnectItems`) keep their inline drizzle
 *    statements against the same handle to preserve the existing
 *    read-after-write guarantee on the inventory pillar's SQLite file.
 *    Both calls validate via in-line reads against the same handle, so
 *    the writes stay inline until PRD-175 PR 3 collapses them onto
 *    `connectionsService.{create, delete}`.
 *
 * The legacy router stays mounted in pops-api as a fall-through while the
 * dispatcher cutover routes `inventory.connections.*` traffic to
 * pops-inventory-api. Consumers (router.ts here) keep the same wire
 * surface — no caller churn.
 */
import { and, eq } from 'drizzle-orm';

import { homeInventory, itemConnections } from '@pops/db-types';
import { ConnectionItemNotFoundError, connectionsService } from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { GraphData, ItemConnectionRow, TraceNode } from './types.js';

/** Count + rows for a paginated list. */
export interface ConnectionListResult {
  rows: ItemConnectionRow[];
  total: number;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ConnectionItemNotFoundError) {
      throw new NotFoundError('Inventory item', err.id);
    }
    throw err;
  }
}

/**
 * Connect two inventory items. Enforces itemAId < itemBId ordering.
 * Validates both items exist. Throws ConflictError on duplicate.
 */
export function connectItems(inputA: string, inputB: string): ItemConnectionRow {
  const db = getInventoryDrizzle();

  if (inputA === inputB) {
    throw new ConflictError('Cannot connect an item to itself');
  }

  const [itemAId, itemBId] = inputA < inputB ? [inputA, inputB] : [inputB, inputA];

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

  const [existing] = db
    .select({ id: itemConnections.id })
    .from(itemConnections)
    .where(and(eq(itemConnections.itemAId, itemAId), eq(itemConnections.itemBId, itemBId)))
    .all();

  if (existing) {
    throw new ConflictError(`Connection between '${itemAId}' and '${itemBId}' already exists`);
  }

  db.insert(itemConnections).values({ itemAId, itemBId }).run();

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
  const db = getInventoryDrizzle();

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

/** List all connections for a given item (checking both A and B columns). */
export function listConnectionsForItem(
  itemId: string,
  limit: number,
  offset: number
): ConnectionListResult {
  return connectionsService.list(getInventoryDrizzle(), itemId, limit, offset);
}

/**
 * Trace the full connection graph from a starting item as a tree.
 * Uses BFS to avoid stack overflow on deep graphs. Handles circular
 * references by tracking visited nodes.
 */
export function traceConnections(itemId: string, maxDepth: number): TraceNode {
  return translate(() => connectionsService.trace(getInventoryDrizzle(), itemId, maxDepth));
}

/** Get the connection subgraph for an item as nodes + edges. */
export function getConnectionGraph(itemId: string, maxDepth: number): GraphData {
  return translate(() => connectionsService.graph(getInventoryDrizzle(), itemId, maxDepth));
}
