/**
 * Helper functions for building Notion properties for inventory items.
 * Separated to keep service.ts cleaner.
 */
import type { UpdateInventoryItemInput } from "./types.js";
import type { NotionUpdateProperties } from "../../shared/notion-client.js";

/**
 * Build Notion properties for inventory update.
 * Only includes fields that are being updated.
 */
export function buildInventoryUpdateProperties(input: UpdateInventoryItemInput): NotionUpdateProperties {
  const properties: NotionUpdateProperties = {};

  if (input.itemName !== undefined) {
    properties["Item Name"] = {
      title: [{ text: { content: input.itemName } }],
    };
  }
  if (input.brand !== undefined) {
    properties["Brand/Manufacturer"] = input.brand
      ? { rich_text: [{ text: { content: input.brand } }] }
      : { rich_text: [] };
  }
  if (input.model !== undefined) {
    properties.Model = input.model
      ? { rich_text: [{ text: { content: input.model } }] }
      : { rich_text: [] };
  }
  if (input.itemId !== undefined) {
    properties.ID = input.itemId
      ? { rich_text: [{ text: { content: input.itemId } }] }
      : { rich_text: [] };
  }
  if (input.room !== undefined) {
    properties.Room = input.room ? { select: { name: input.room } } : { select: null };
  }
  if (input.location !== undefined) {
    properties.Location = input.location ? { select: { name: input.location } } : { select: null };
  }
  if (input.type !== undefined) {
    properties.Type = input.type ? { select: { name: input.type } } : { select: null };
  }
  if (input.condition !== undefined) {
    properties.Condition = input.condition
      ? { select: { name: input.condition } }
      : { select: null };
  }
  if (input.inUse !== undefined) {
    properties["In-use"] = { checkbox: input.inUse };
  }
  if (input.deductible !== undefined) {
    properties.Deductible = { checkbox: input.deductible };
  }
  if (input.purchaseDate !== undefined) {
    properties["Purchase Date"] = input.purchaseDate
      ? { date: { start: input.purchaseDate } }
      : { date: null };
  }
  if (input.warrantyExpires !== undefined) {
    properties["Warranty Expires"] = input.warrantyExpires
      ? { date: { start: input.warrantyExpires } }
      : { date: null };
  }
  if (input.replacementValue !== undefined) {
    properties["Est. Replacement Value"] =
      input.replacementValue !== null ? { number: input.replacementValue } : { number: null };
  }
  if (input.resaleValue !== undefined) {
    properties["Est. Resale Value"] =
      input.resaleValue !== null ? { number: input.resaleValue } : { number: null };
  }
  if (input.purchaseTransactionId !== undefined) {
    properties["Purchase Transaction"] = input.purchaseTransactionId
      ? { relation: [{ id: input.purchaseTransactionId }] }
      : { relation: [] };
  }
  if (input.purchasedFromId !== undefined) {
    properties["Purchased From"] = input.purchasedFromId
      ? { relation: [{ id: input.purchasedFromId }] }
      : { relation: [] };
  }

  return properties;
}
