import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Papa from "papaparse";
import type { Database } from "better-sqlite3";
import { seedEntity, createCaller, createTestDb } from "../../shared/test-utils.js";
import { transformAmex } from "./transformers/amex.js";
import { clearCache } from "./lib/ai-categorizer.js";
import type { ConfirmedTransaction, ProcessImportOutput, ExecuteImportOutput } from "./types.js";

/**
 * E2E Integration Test for Complete Import Flow
 *
 * Tests the entire import pipeline from CSV → Notion with:
 * - Real CSV parsing (using test data)
 * - Real transformer functions
 * - Real entity matching (with seeded data)
 * - Mocked Notion API (100% offline)
 * - Mocked AI categorization (100% offline)
 *
 * NO external API calls - fully reproducible.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock Notion client
const mockNotionQuery = vi.fn();
const mockNotionCreate = vi.fn();

vi.mock("@notionhq/client", () => {
  return {
    Client: vi.fn().mockImplementation(() => {
      return {
        databases: {
          query: mockNotionQuery,
        },
        pages: {
          create: mockNotionCreate,
        },
      };
    }),
  };
});

// Mock AI categorizer with smart lookup-based responses
vi.mock("./lib/ai-categorizer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/ai-categorizer.js")>();
  const mock = await import("./lib/ai-categorizer.mock.js");
  return {
    ...actual,
    categorizeWithAi: mock.mockCategorizeWithAi,
  };
});

import { resetMockAi, mockConfig } from "./lib/ai-categorizer.mock.js";
import { setDb, closeDb } from "../../db.js";

let caller: ReturnType<typeof createCaller>;
let db: Database;
const originalNotionToken = process.env["NOTION_API_TOKEN"];

/**
 * Helper to poll for import progress until completion
 */
async function waitForCompletion<T extends ProcessImportOutput | ExecuteImportOutput>(
  sessionId: string,
  maxAttempts = 100
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const progress = await caller.imports.getImportProgress({ sessionId });
    if (!progress) {
      throw new Error("Progress not found");
    }
    if (progress.status === "completed") {
      if (!progress.result) throw new Error("Import completed but result is missing");
      return progress.result as T;
    }
    if (progress.status === "failed") {
      throw new Error(`Import failed: ${progress.errors?.map((e) => e.error).join(", ")}`);
    }
    // Wait 10ms before next poll
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timeout waiting for import to complete");
}

beforeEach(() => {
  db = createTestDb();
  setDb(db);
  caller = createCaller(true);

  mockNotionQuery.mockClear();
  mockNotionCreate.mockClear();
  resetMockAi();
  clearCache();

  // Set all required Notion env vars
  process.env["NOTION_API_TOKEN"] = "test-notion-token";
  process.env["NOTION_BALANCE_SHEET_ID"] = "test-balance-sheet-id";
  process.env["NOTION_ENTITIES_DB_ID"] = "test-entities-db-id";
  process.env["NOTION_HOME_INVENTORY_ID"] = "test-inventory-id";
  process.env["NOTION_BUDGET_ID"] = "test-budget-id";
  process.env["NOTION_WISH_LIST_ID"] = "test-wishlist-id";
});

afterEach(() => {
  closeDb();
  if (originalNotionToken === undefined) {
    delete process.env["NOTION_API_TOKEN"];
  } else {
    process.env["NOTION_API_TOKEN"] = originalNotionToken;
  }

  // Clean up other env vars
  delete process.env["NOTION_BALANCE_SHEET_ID"];
  delete process.env["NOTION_ENTITIES_DB_ID"];
  delete process.env["NOTION_HOME_INVENTORY_ID"];
  delete process.env["NOTION_BUDGET_ID"];
  delete process.env["NOTION_WISH_LIST_ID"];
});

describe("E2E: Complete Import Flow", () => {
  it("imports Amex CSV end-to-end", async () => {
    // Step 0: Seed test entities in database
    seedEntity(db, {
      name: "Woolworths",
      id: "woolworths-id-123",
      aliases: "WW, WOOLIES",
    });
    seedEntity(db, {
      name: "Coles",
      id: "coles-id-456",
    });
    seedEntity(db, {
      name: "Netflix",
      id: "netflix-id-789",
    });
    seedEntity(db, {
      name: "Transport for NSW",
      id: "transport-nsw-id-abc",
      aliases: "TRANSPORTFORNSWTRAVEL, OPAL",
    });
    seedEntity(db, {
      name: "Roastville",
      id: "roastville-id-def",
    });

    // Step 1: Load and parse test CSV with proper CSV parser
    const csvPath = join(__dirname, "test-data", "amex-sample.csv");
    const csvContent = readFileSync(csvPath, "utf-8");

    // Parse CSV with papaparse (handles quoted fields, multiline, commas in fields)
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    expect(parseResult.errors.length).toBe(0); // No CSV parsing errors
    const rows = parseResult.data as Record<string, string>[];

    // Step 2: Transform CSV rows
    const parsed = rows.map((row) => transformAmex(row));

    expect(parsed.length).toBe(10); // 10 transactions in CSV
    expect(parsed[0].date).toBe("2026-02-13");
    expect(parsed[0].amount).toBe(-125.5); // Inverted

    // Step 3: Mock Notion to simulate 1 existing checksum (row 7 is duplicate of row 1)
    const existingChecksum = parsed[6].checksum; // 7th row (duplicate)
    mockNotionQuery.mockResolvedValue({
      results: [
        {
          properties: {
            Checksum: {
              type: "rich_text",
              rich_text: [{ plain_text: existingChecksum }],
            },
          },
        },
      ],
    });

    // Step 4: Pattern matching in mock will categorize unknown merchant
    // (no explicit setup needed - default fallback returns "Unknown Merchant")

    // Step 5: Process import (dedup + entity match)
    const { sessionId: processSessionId } = await caller.imports.processImport({
      transactions: parsed,
      account: "Amex",
    });

    const processed = await waitForCompletion<ProcessImportOutput>(processSessionId);
    expect(processed).toBeDefined();

    // Verify categorization results
    expect(processed.matched.length).toBeGreaterThan(0);
    expect(processed.skipped.length).toBe(1); // 1 duplicate
    expect(processed.uncertain.length).toBeGreaterThanOrEqual(1); // AI suggested new entity

    // Verify specific matches
    const woolworthsMatch = processed.matched.find((t) => t.description.includes("WOOLWORTHS"));
    expect(woolworthsMatch?.entity.entityName).toBe("Woolworths");
    expect(woolworthsMatch?.entity.matchType).toBe("prefix");

    const transportMatch = processed.matched.find((t) =>
      t.description.includes("TRANSPORTFORNSWTRAVEL")
    );
    expect(transportMatch?.entity.entityName).toBe("Transport for NSW");
    expect(transportMatch?.entity.matchType).toBe("alias");

    const netflixMatch = processed.matched.find((t) => t.description.includes("NETFLIX"));
    expect(netflixMatch?.entity.entityName).toBe("Netflix");
    expect(netflixMatch?.entity.matchType).toBe("contains");

    // Step 6: Manually resolve uncertain transactions
    const confirmed: ConfirmedTransaction[] = [
      ...processed.matched.map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        account: t.account,
        location: t.location,
        online: t.online,
        rawRow: t.rawRow,
        checksum: t.checksum,
        entityId: t.entity.entityId ?? "",
        entityName: t.entity.entityName ?? "",
        entityUrl: t.entity.entityUrl ?? "",
      })),
    ];

    expect(confirmed.length).toBeGreaterThan(0);

    // Step 7: Mock Notion page creation
    let createCount = 0;
    mockNotionCreate.mockImplementation(() => {
      createCount++;
      return Promise.resolve({ id: `page-id-${createCount}` });
    });

    // Step 8: Execute import (write to Notion)
    const { sessionId: executeSessionId } = await caller.imports.executeImport({
      transactions: confirmed,
    });

    // executeImport has 400ms rate limit per transaction, so increase timeout
    const result = await waitForCompletion<ExecuteImportOutput>(executeSessionId, 500); // 5 second timeout
    expect(result).toBeDefined();

    // Step 9: Verify results
    expect(result.imported).toBe(confirmed.length);
    expect(result.failed.length).toBe(0);

    // Verify Notion API calls
    expect(mockNotionCreate).toHaveBeenCalledTimes(confirmed.length);

    // Verify structure of Notion page creation
    const firstCall = mockNotionCreate.mock.calls[0][0];
    expect(firstCall).toHaveProperty("parent");
    expect(firstCall).toHaveProperty("properties");
    expect(firstCall.properties).toHaveProperty("Description");
    expect(firstCall.properties).toHaveProperty("Amount");
    expect(firstCall.properties).toHaveProperty("Date");
    expect(firstCall.properties).toHaveProperty("Checksum");
    expect(firstCall.properties).toHaveProperty("Raw Row");
    expect(firstCall.properties).toHaveProperty("Entity");
  }, 30000); // 30 second timeout

  it("handles complete failure gracefully", async () => {
    // Mock Notion API to always fail
    mockNotionQuery.mockResolvedValue({ results: [] });
    mockNotionCreate.mockRejectedValue(new Error("Notion API Error"));

    const mockTransaction: ConfirmedTransaction = {
      date: "2026-02-13",
      description: "TEST",
      amount: -100,
      account: "Amex",
      rawRow: "{}",
      checksum: "test123",
      entityId: "entity-id",
      entityName: "Entity",
      entityUrl: "https://notion.so/entity",
    };

    const { sessionId } = await caller.imports.executeImport({
      transactions: [mockTransaction],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.imported).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].error).toContain("Notion API Error");
  }, 10000);

  it("deduplicates correctly across multiple imports", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    const transaction = {
      date: "2026-02-13",
      description: "WOOLWORTHS 1234",
      amount: -125.5,
      account: "Amex",
      location: "Sydney",
      online: false,
      rawRow: '{"test": "data"}',
      checksum: "unique-checksum-123",
    };

    // First import - no duplicates
    mockNotionQuery.mockResolvedValue({ results: [] });

    const { sessionId: sid1 } = await caller.imports.processImport({
      transactions: [transaction],
      account: "Amex",
    });

    const result1 = await waitForCompletion<ProcessImportOutput>(sid1);
    expect(result1).toBeDefined();

    expect(result1.matched.length).toBe(1);
    expect(result1.skipped.length).toBe(0);

    // Second import - mock that checksum now exists
    mockNotionQuery.mockResolvedValue({
      results: [
        {
          properties: {
            Checksum: {
              type: "rich_text",
              rich_text: [{ plain_text: "unique-checksum-123" }],
            },
          },
        },
      ],
    });

    const { sessionId: sid2 } = await caller.imports.processImport({
      transactions: [transaction],
      account: "Amex",
    });

    const result2 = await waitForCompletion<ProcessImportOutput>(sid2);
    expect(result2).toBeDefined();

    expect(result2.matched.length).toBe(0);
    expect(result2.skipped.length).toBe(1);
    expect(result2.skipped[0].skipReason).toContain("Duplicate");
  });

  it("handles mixed transaction types in single batch", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    mockNotionQuery.mockResolvedValue({ results: [] });

    // Mock AI to return null — unknown transaction routes to uncertain (needs human review)
    mockConfig.alwaysReturnNull = true;

    const transactions = [
      {
        // Will match
        date: "2026-02-13",
        description: "WOOLWORTHS 1234",
        amount: -100,
        account: "Amex",
        rawRow: "{}",
        checksum: "match123",
      },
      {
        // Will fail (unknown)
        date: "2026-02-14",
        description: "UNKNOWN MERCHANT",
        amount: -50,
        account: "Amex",
        rawRow: "{}",
        checksum: "unknown123",
      },
    ];

    const { sessionId } = await caller.imports.processImport({
      transactions,
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.matched.length).toBe(1);
    expect(result.uncertain.length).toBe(1);
    expect(result.failed.length).toBe(0);
  });

  it("preserves transaction data through complete pipeline", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });
    mockNotionQuery.mockResolvedValue({ results: [] });
    mockNotionCreate.mockResolvedValue({ id: "page-id" });

    const originalTransaction = {
      date: "2026-02-13",
      description: "WOOLWORTHS 1234",
      amount: -125.5,
      account: "Amex",
      location: "North Sydney",
      online: false,
      rawRow: '{"original": "data"}',
      checksum: "preserve123",
    };

    // Process
    const { sessionId: processSessionId } = await caller.imports.processImport({
      transactions: [originalTransaction],
      account: "Amex",
    });

    const processed = await waitForCompletion<ProcessImportOutput>(processSessionId);
    expect(processed).toBeDefined();

    // Convert to confirmed
    const confirmed: ConfirmedTransaction = {
      ...processed.matched[0],
      entityId: processed.matched[0].entity.entityId ?? "",
      entityName: processed.matched[0].entity.entityName ?? "",
      entityUrl: processed.matched[0].entity.entityUrl ?? "",
    };

    // Execute
    const { sessionId: executeSessionId } = await caller.imports.executeImport({
      transactions: [confirmed],
    });

    await waitForCompletion<ExecuteImportOutput>(executeSessionId, 500); // 5 second timeout for rate limiting

    // Verify data preservation in Notion call
    const notionCall = mockNotionCreate.mock.calls[0][0];
    expect(notionCall.properties.Description.title[0].text.content).toBe("WOOLWORTHS 1234");
    expect(notionCall.properties.Amount.number).toBe(-125.5);
    expect(notionCall.properties.Date.date.start).toBe("2026-02-13");
    expect(notionCall.properties.Location.select.name).toBe("North Sydney");
    expect(notionCall.properties.Tags.multi_select).toEqual([]);
    expect(notionCall.properties.Checksum.rich_text[0].text.content).toBe("preserve123");
  }, 10000);
});

describe("E2E: CSV Transformer Accuracy", () => {
  it("correctly parses Amex CSV format", () => {
    const row = {
      Date: "13/02/2026",
      Description: "WOOLWORTHS  1234",
      Amount: "125.50",
      "Town/City": "NORTH SYDNEY\nNSW",
      Country: "AUSTRALIA",
    };

    const result = transformAmex(row);

    expect(result.date).toBe("2026-02-13");
    expect(result.description).toBe("WOOLWORTHS 1234"); // Double space removed
    expect(result.amount).toBe(-125.5); // Inverted
    expect(result.account).toBe("Amex");
    expect(result.location).toBe("North Sydney"); // Title-cased, first line only
    expect(result.online).toBe(false);
    expect(result.checksum).toHaveLength(64); // SHA-256
    expect(result.rawRow).toBe(JSON.stringify(row));
  });

  it("detects online transactions", () => {
    const row = {
      Date: "13/02/2026",
      Description: "PAYPAL *NETFLIX",
      Amount: "15.99",
    };

    const result = transformAmex(row);

    expect(result.online).toBe(true);
  });

  it("handles refunds (negative amounts)", () => {
    const row = {
      Date: "13/02/2026",
      Description: "REFUND WOOLWORTHS",
      Amount: "-50.00",
    };

    const result = transformAmex(row);

    expect(result.amount).toBe(50.0); // Inverted (negative becomes positive)
  });
});
