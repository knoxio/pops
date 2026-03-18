/**
 * Shared Notion client factory and database ID helpers.
 * Used across all modules that need to sync with Notion.
 */
import { Client } from "@notionhq/client";
import type {
  CreatePageParameters,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { requireEnv } from "../env.js";
import { getMockNotionClient } from "./test-globals.js";

/** Notion property map type for pages.create calls. */
export type NotionCreateProperties = CreatePageParameters["properties"];

/** Notion property map type for pages.update calls. */
export type NotionUpdateProperties = NonNullable<UpdatePageParameters["properties"]>;

/**
 * Create Notion client from environment.
 * Reads NOTION_API_TOKEN from environment or Docker secrets.
 * In test mode, returns the mock client if available.
 */
export function getNotionClient(): Client {
  // Check if we're in test mode with a mock client
  const mockClient = getMockNotionClient();
  if (mockClient) {
    return mockClient;
  }

  const token = requireEnv("NOTION_API_TOKEN");
  // In CI/test environments the token is a dummy and api.notion.com may be
  // unreachable. Use a short timeout so failures are fast rather than hanging
  // for the OS default TCP timeout (~17s), which breaks integration test timing.
  const timeoutMs = process.env["NOTION_TIMEOUT_MS"]
    ? Number(process.env["NOTION_TIMEOUT_MS"])
    : undefined;
  return new Client({ auth: token, timeoutMs });
}

/**
 * Get Notion database IDs from environment.
 * These are workspace-specific and loaded from .env (local) or Ansible Vault (production).
 */
export const getBalanceSheetId = (): string => requireEnv("NOTION_BALANCE_SHEET_ID");
export const getEntitiesDbId = (): string => requireEnv("NOTION_ENTITIES_DB_ID");
export const getHomeInventoryId = (): string => requireEnv("NOTION_HOME_INVENTORY_ID");
export const getBudgetId = (): string => requireEnv("NOTION_BUDGET_ID");
export const getWishListId = (): string => requireEnv("NOTION_WISH_LIST_ID");
