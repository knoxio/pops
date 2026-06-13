/**
 * Input and result types for the item connections service.
 *
 * Validation (zod) and the API response mapper live with the router
 * layers — this package stays HTTP-agnostic and only exposes the
 * service surface and row types needed to call it.
 */
import type { ItemConnectionRow } from '@pops/db-types';

export type { ItemConnectionRow };

/** Input for creating a new item connection. */
export interface CreateConnectionInput {
  itemAId: string;
  itemBId: string;
}

/** Paginated list result for connections. */
export interface ConnectionListResult {
  rows: ItemConnectionRow[];
  total: number;
}

/** Public API shape for an item connection. */
export interface Connection {
  id: number;
  itemAId: string;
  itemBId: string;
  createdAt: string;
}

/** Map a SQLite row to the public API shape. */
export function toConnection(row: ItemConnectionRow): Connection {
  return {
    id: row.id,
    itemAId: row.itemAId,
    itemBId: row.itemBId,
    createdAt: row.createdAt,
  };
}

/** Tree node returned by `traceConnections`. */
export interface TraceNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  children: TraceNode[];
}

/** Node in a connection graph. */
export interface GraphNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
}

/** Edge in a connection graph (always emitted with A<B ordering). */
export interface GraphEdge {
  source: string;
  target: string;
}

/** Full connection subgraph for an item. */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
