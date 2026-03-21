import { z } from "zod";
import type { ItemConnectionRow } from "@pops/db-types";

export type { ItemConnectionRow };

/** API response shape for an item connection. */
export interface ItemConnection {
  id: number;
  itemAId: string;
  itemBId: string;
  createdAt: string;
}

/** Map a SQLite row to the API response shape. */
export function toConnection(row: ItemConnectionRow): ItemConnection {
  return {
    id: row.id,
    itemAId: row.itemAId,
    itemBId: row.itemBId,
    createdAt: row.createdAt,
  };
}

/** Zod schema for connecting two items. */
export const ConnectItemsSchema = z.object({
  itemAId: z.string().min(1, "Item A ID is required"),
  itemBId: z.string().min(1, "Item B ID is required"),
});
export type ConnectItemsInput = z.infer<typeof ConnectItemsSchema>;

/** Zod schema for listing connections for an item. */
export const ConnectionQuerySchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type ConnectionQuery = z.infer<typeof ConnectionQuerySchema>;

/** Tree node for connection chain tracing. */
export interface TraceNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  children: TraceNode[];
}

/** Zod schema for trace query. */
export const TraceQuerySchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  maxDepth: z.coerce.number().int().positive().max(10).optional().default(10),
});
export type TraceQuery = z.infer<typeof TraceQuerySchema>;
