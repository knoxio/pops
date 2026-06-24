/**
 * Inventory connections read/write surface.
 *
 * All five operations (`listConnectionsForItem`, `traceConnections`,
 * `getConnectionGraph`, `connectItems`, `disconnectItems`) delegate to
 * `connectionsService` from the pillar's persistence barrel (`src/db`). The
 * drizzle handle is passed in as the `db` argument by the caller.
 *
 * Typed errors from the persistence layer are translated to the in-tree
 * `NotFoundError` / `ConflictError` instances so the router's `instanceof`
 * checks keep working:
 *  - `ConnectionItemNotFoundError`  -> `NotFoundError('Inventory item', id)`
 *  - `ConnectionNotFoundError`      -> `NotFoundError('Item connection', 'A-B')`
 *  - `ConnectionConflictError`      -> `ConflictError(<existing-pair message>)`
 *  - `SelfConnectionError`          -> `ConflictError('Cannot connect an item to itself')`
 */
import {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  connectionsService,
  type InventoryDb,
  SelfConnectionError,
} from '../../../db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

import type { GraphData, ItemConnectionRow, TraceNode } from './types.js';

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
export function connectItems(db: InventoryDb, inputA: string, inputB: string): ItemConnectionRow {
  return translate(() => connectionsService.create(db, { itemAId: inputA, itemBId: inputB }));
}

/**
 * Disconnect two items by their item IDs. Normalises A<B ordering before lookup.
 * Throws NotFoundError if no connection exists between the two items.
 */
export function disconnectItems(db: InventoryDb, inputA: string, inputB: string): void {
  translate(() => connectionsService.delete(db, inputA, inputB));
}

/** List all connections for a given item (checking both A and B columns). */
export function listConnectionsForItem(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): ConnectionListResult {
  return connectionsService.list(db, itemId, limit, offset);
}

/**
 * Trace the full connection graph from a starting item as a tree.
 * Uses BFS to avoid stack overflow on deep graphs. Handles circular
 * references by tracking visited nodes.
 */
export function traceConnections(db: InventoryDb, itemId: string, maxDepth: number): TraceNode {
  return translate(() => connectionsService.trace(db, itemId, maxDepth));
}

/** Get the connection subgraph for an item as nodes + edges. */
export function getConnectionGraph(db: InventoryDb, itemId: string, maxDepth: number): GraphData {
  return translate(() => connectionsService.graph(db, itemId, maxDepth));
}
