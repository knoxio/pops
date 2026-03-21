/**
 * Item connections service — connect/disconnect inventory items using Drizzle ORM.
 * Enforces A<B ordering to prevent duplicate bidirectional pairs.
 */
import { eq, and, or, count } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { itemConnections, homeInventory } from "@pops/db-types";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import type { ItemConnectionRow, TraceNode } from "./types.js";

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
    throw new ConflictError("Cannot connect an item to itself");
  }

  // Enforce A<B ordering
  const [itemAId, itemBId] = inputA < inputB ? [inputA, inputB] : [inputB, inputA];

  // Validate both items exist
  const [itemA] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemAId))
    .all();
  if (!itemA) throw new NotFoundError("Inventory item", itemAId);

  const [itemB] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemBId))
    .all();
  if (!itemB) throw new NotFoundError("Inventory item", itemBId);

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

  if (!row) throw new NotFoundError("Item connection", String(id));

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

  return { rows, total: countResult.total };
}

/** Maximum depth for connection chain tracing. */
const MAX_TRACE_DEPTH = 10;

/**
 * Trace connection chains from a starting item using BFS.
 * Returns a tree of connected items. Handles circular references
 * via a visited set. Depth-limited to prevent runaway traversal.
 */
export function traceConnections(startItemId: string): TraceNode {
  const db = getDrizzle();

  const startItem = db
    .select({
      id: homeInventory.id,
      itemName: homeInventory.itemName,
      type: homeInventory.type,
      assetId: homeInventory.assetId,
    })
    .from(homeInventory)
    .where(eq(homeInventory.id, startItemId))
    .get();

  if (!startItem) throw new NotFoundError("Inventory item", startItemId);

  const visited = new Set<string>([startItemId]);

  function buildTree(itemId: string, depth: number): TraceNode[] {
    if (depth >= MAX_TRACE_DEPTH) return [];

    const connections = db
      .select()
      .from(itemConnections)
      .where(or(eq(itemConnections.itemAId, itemId), eq(itemConnections.itemBId, itemId)))
      .all();

    const children: TraceNode[] = [];

    for (const conn of connections) {
      const connectedId = conn.itemAId === itemId ? conn.itemBId : conn.itemAId;
      if (visited.has(connectedId)) continue;
      visited.add(connectedId);

      const item = db
        .select({
          id: homeInventory.id,
          itemName: homeInventory.itemName,
          type: homeInventory.type,
          assetId: homeInventory.assetId,
        })
        .from(homeInventory)
        .where(eq(homeInventory.id, connectedId))
        .get();

      if (!item) continue;

      children.push({
        id: item.id,
        itemName: item.itemName,
        type: item.type,
        assetId: item.assetId,
        children: buildTree(item.id, depth + 1),
      });
    }

    return children;
  }

  return {
    id: startItem.id,
    itemName: startItem.itemName,
    type: startItem.type,
    assetId: startItem.assetId,
    children: buildTree(startItemId, 0),
  };
}
