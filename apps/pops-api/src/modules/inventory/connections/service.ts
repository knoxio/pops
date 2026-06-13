/**
 * Inventory connections read/write surface — PRD-175 PR 3 cutover.
 *
 * All five operations (`listConnectionsForItem`, `traceConnections`,
 * `getConnectionGraph`, `connectItems`, `disconnectItems`) now delegate to
 * `connectionsService` from `@pops/inventory-db`, resolved against the
 * inventory pillar handle (`getInventoryDrizzle()`). The legacy inline
 * drizzle writes have been removed — `connectionsService.create` /
 * `connectionsService.delete` own the wire surface end-to-end (mirrors
 * PRD-179 PR 3 + PRD-165 PR 3).
 *
 * Typed errors from the package layer are translated back to the in-tree
 * `NotFoundError` / `ConflictError` instances so the router's `instanceof`
 * checks keep working (mirrors the items #3014 / engrams #3021 pattern):
 *  - `ConnectionItemNotFoundError`  -> `NotFoundError('Inventory item', id)`
 *  - `ConnectionNotFoundError`      -> `NotFoundError('Item connection', 'A-B')`
 *  - `ConnectionConflictError`      -> `ConflictError(<existing-pair message>)`
 *  - `SelfConnectionError`          -> `ConflictError('Cannot connect an item to itself')`
 *
 * The legacy router stays mounted in pops-api as a fall-through while the
 * dispatcher cutover routes `inventory.connections.*` traffic to
 * pops-inventory-api. Consumers (router.ts here) keep the same wire
 * surface — no caller churn.
 */
import {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  connectionsService,
  SelfConnectionError,
} from '@pops/inventory-db';

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
    if (err instanceof ConnectionNotFoundError) {
      throw new NotFoundError('Item connection', `${err.itemAId}-${err.itemBId}`);
    }
    if (err instanceof ConnectionConflictError || err instanceof SelfConnectionError) {
      throw new ConflictError(err.message);
    }
    throw err;
  }
}

/**
 * Connect two inventory items. Enforces itemAId < itemBId ordering.
 * Validates both items exist. Throws ConflictError on duplicate or
 * self-connection.
 */
export function connectItems(inputA: string, inputB: string): ItemConnectionRow {
  return translate(() =>
    connectionsService.create(getInventoryDrizzle(), { itemAId: inputA, itemBId: inputB })
  );
}

/**
 * Disconnect two items by their item IDs. Normalises A<B ordering before lookup.
 * Throws NotFoundError if no connection exists between the two items.
 */
export function disconnectItems(inputA: string, inputB: string): void {
  translate(() => connectionsService.delete(getInventoryDrizzle(), inputA, inputB));
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
