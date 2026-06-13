/**
 * Item connections CRUD + traversal service.
 *
 * Each function takes an `InventoryDb` handle as its first argument; the
 * calling layer (pops-api modules, pops-inventory-api routers) resolves
 * the singleton or transaction handle to pass in. Mirrors the items /
 * locations writer pattern (db-arg, typed errors).
 *
 * The live writer in `apps/pops-api/src/modules/inventory/connections/service.ts`
 * is the source of truth for the wire surface — this scaffold mirrors
 * its semantics so the PR2 reads-cutover can swap consumers over to
 * `connectionsService.*` without a behavioural change.
 *
 * Pair ordering invariant: `item_a_id < item_b_id` is enforced by a CHECK
 * constraint at the schema level. The service normalises caller-provided
 * pairs to satisfy that ordering before any insert / lookup / delete.
 */
import { and, asc, count, eq, or } from 'drizzle-orm';

import { homeInventory, itemConnections } from '../schema.js';
import {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  SelfConnectionError,
} from './connections-errors.js';
import { getConnectionGraph } from './connections-graph.js';

import type {
  ConnectionListResult,
  CreateConnectionInput,
  GraphData,
  ItemConnectionRow,
  TraceNode,
} from './connections-types.js';
import type { InventoryDb } from './internal.js';

export {
  type Connection,
  type ConnectionListResult,
  type CreateConnectionInput,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type ItemConnectionRow,
  toConnection,
  type TraceNode,
} from './connections-types.js';

export {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  SelfConnectionError,
} from './connections-errors.js';

export { getConnectionGraph } from './connections-graph.js';

/** Normalise a caller-provided pair to satisfy the A<B schema invariant. */
function normalisePair(inputA: string, inputB: string): [string, string] {
  return inputA < inputB ? [inputA, inputB] : [inputB, inputA];
}

function assertItemExists(db: InventoryDb, id: string): void {
  const [row] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, id))
    .all();
  if (!row) throw new ConnectionItemNotFoundError(id);
}

function findByPair(
  db: InventoryDb,
  itemAId: string,
  itemBId: string
): ItemConnectionRow | undefined {
  const [row] = db
    .select()
    .from(itemConnections)
    .where(and(eq(itemConnections.itemAId, itemAId), eq(itemConnections.itemBId, itemBId)))
    .all();
  return row;
}

/**
 * List connections for a given item (matches rows where the item appears in
 * either the A or B column). Paginated; returns the matching slice plus the
 * full count for the filter.
 */
export function list(
  db: InventoryDb,
  itemId: string,
  limit: number,
  offset: number
): ConnectionListResult {
  const condition = or(eq(itemConnections.itemAId, itemId), eq(itemConnections.itemBId, itemId));

  const rows = db
    .select()
    .from(itemConnections)
    .where(condition)
    .orderBy(asc(itemConnections.id))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db.select({ total: count() }).from(itemConnections).where(condition).all();

  return { rows, total: countResult?.total ?? 0 };
}

/**
 * Look up a connection by the ordered pair. Normalises ordering before
 * the lookup. Throws `ConnectionNotFoundError` if no row matches.
 */
export function get(db: InventoryDb, inputA: string, inputB: string): ItemConnectionRow {
  const [itemAId, itemBId] = normalisePair(inputA, inputB);
  const row = findByPair(db, itemAId, itemBId);
  if (!row) throw new ConnectionNotFoundError(itemAId, itemBId);
  return row;
}

/**
 * Connect two inventory items. Validates both endpoints exist, rejects
 * self-connections, and rejects duplicate pairs (after A<B normalisation).
 */
export function create(db: InventoryDb, input: CreateConnectionInput): ItemConnectionRow {
  if (input.itemAId === input.itemBId) {
    throw new SelfConnectionError(input.itemAId);
  }

  const [itemAId, itemBId] = normalisePair(input.itemAId, input.itemBId);

  assertItemExists(db, itemAId);
  assertItemExists(db, itemBId);

  if (findByPair(db, itemAId, itemBId)) {
    throw new ConnectionConflictError(itemAId, itemBId);
  }

  db.insert(itemConnections).values({ itemAId, itemBId }).run();

  const created = findByPair(db, itemAId, itemBId);
  if (!created) throw new ConnectionNotFoundError(itemAId, itemBId);
  return created;
}

/**
 * Disconnect two items. Normalises the pair before lookup. Throws
 * `ConnectionNotFoundError` if no connection exists.
 */
function deleteConnection(db: InventoryDb, inputA: string, inputB: string): void {
  const [itemAId, itemBId] = normalisePair(inputA, inputB);
  const row = findByPair(db, itemAId, itemBId);
  if (!row) throw new ConnectionNotFoundError(itemAId, itemBId);

  db.delete(itemConnections).where(eq(itemConnections.id, row.id)).run();
}

export { deleteConnection as delete };

/**
 * Walk the connection chain from `itemId` as a tree, capped at `maxDepth`
 * hops. Uses BFS with a visited set to break cycles. Throws
 * `ConnectionItemNotFoundError` if the root item is missing.
 */
export function trace(db: InventoryDb, itemId: string, maxDepth: number): TraceNode {
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

  if (!startItem) throw new ConnectionItemNotFoundError(itemId);

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

/** Build the nodes-and-edges subgraph rooted at `itemId`. */
export function graph(db: InventoryDb, itemId: string, maxDepth: number): GraphData {
  return getConnectionGraph(db, itemId, maxDepth);
}
