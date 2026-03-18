import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedEntity, createCaller } from "../../shared/test-utils.js";
import { clearCache } from "./lib/ai-categorizer.js";
import type {
  ProcessImportOutput,
  ExecuteImportOutput,
  ParsedTransaction,
  ConfirmedTransaction,
} from "./types.js";

/**
 * Unit tests for imports tRPC router.
 * Tests input validation and service function integration with mocked Notion API.
 */

// Mock AI categorizer with smart lookup-based responses
vi.mock("./lib/ai-categorizer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/ai-categorizer.js")>();
  const mock = await import("./lib/ai-categorizer.mock.js");
  return {
    ...actual,
    categorizeWithAi: mock.mockCategorizeWithAi,
  };
});

import type { Client } from "@notionhq/client";
import { resetMockAi } from "./lib/ai-categorizer.mock.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;
let _notionMock: Client;

/** Shape of a row returned from the entities SQLite table. */
type EntityRow = { name: string; id: string; last_edited_time: string };

/**
 * Helper to poll for import progress until completion
 */
async function waitForCompletion<T extends ProcessImportOutput | ExecuteImportOutput>(
  sessionId: string,
  maxAttempts = 50
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
    // Wait 10ms before next poll (tests run fast)
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timeout waiting for import to complete");
}

beforeEach(() => {
  ({ caller, db, notionMock: _notionMock } = ctx.setup());
  resetMockAi();
  clearCache();
});

afterEach(() => {
  ctx.teardown();
});

describe("imports.processImport", () => {
  beforeEach(() => {});

  it("validates input schema (requires transactions array)", async () => {
    await expect(
      caller.imports.processImport({ account: "Amex" } as {
        transactions: ParsedTransaction[];
        account: string;
      })
    ).rejects.toThrow();
  });

  it("validates input schema (requires account)", async () => {
    await expect(
      // account: "" fails z.string().min(1) at runtime
      caller.imports.processImport({ transactions: [], account: "" })
    ).rejects.toThrow();
  });

  it("validates transaction schema (requires date)", async () => {
    await expect(
      caller.imports.processImport({
        transactions: [
          {
            description: "TEST",
            amount: -100,
            account: "Amex",
            rawRow: "{}",
            checksum: "abc123",
            // Missing date intentionally — tests runtime Zod validation
          } as ParsedTransaction,
        ],
        account: "Amex",
      })
    ).rejects.toThrow();
  });

  it("validates date format (YYYY-MM-DD)", async () => {
    await expect(
      caller.imports.processImport({
        transactions: [
          {
            date: "13/02/2026", // Wrong format
            description: "TEST",
            amount: -100,
            account: "Amex",
            rawRow: "{}",
            checksum: "abc123",
          },
        ],
        account: "Amex",
      })
    ).rejects.toThrow();
  });

  it("processes valid input successfully", async () => {
    seedEntity(db, { name: "Woolworths", id: "woolworths-id" });

    const { sessionId } = await caller.imports.processImport({
      transactions: [
        {
          date: "2026-02-13",
          description: "WOOLWORTHS 1234",
          amount: -125.5,
          account: "Amex",
          location: "Sydney",
          online: false,
          rawRow: "{}",
          checksum: "abc123",
        },
      ],
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);
    expect(result).toBeDefined();
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].entity.entityName).toBe("Woolworths");
  });

  it("returns correct output structure", async () => {
    const { sessionId } = await caller.imports.processImport({
      transactions: [],
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);

    expect(result).toBeDefined();
    expect(result).toHaveProperty("matched");
    expect(result).toHaveProperty("uncertain");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("skipped");
    expect(Array.isArray(result.matched)).toBe(true);
  });

  it("handles large batch (100+ transactions)", async () => {
    const transactions = Array.from({ length: 100 }, (_, i) => ({
      date: "2026-02-13",
      description: `TRANSACTION ${i}`,
      amount: -100,
      account: "Amex",
      rawRow: `{"id": ${i}}`,
      checksum: `checksum-${i}`,
    }));

    const { sessionId } = await caller.imports.processImport({
      transactions,
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);
    expect(result).toBeDefined();
    // All categories combined should equal total transactions
    const total =
      result.matched.length +
      result.uncertain.length +
      result.failed.length +
      result.skipped.length;
    expect(total).toBe(100);
  });

  it("accepts optional fields (location, online)", async () => {
    const { sessionId } = await caller.imports.processImport({
      transactions: [
        {
          date: "2026-02-13",
          description: "TEST",
          amount: -100,
          account: "Amex",
          rawRow: "{}",
          checksum: "abc123",
          location: "Sydney",
          online: true,
        },
      ],
      account: "Amex",
    });

    const result = await waitForCompletion<ProcessImportOutput>(sessionId);
    expect(result).toBeDefined();
  });
});

describe("imports.executeImport", () => {
  it("validates input schema (requires transactions array)", async () => {
    await expect(
      caller.imports.executeImport({} as { transactions: ConfirmedTransaction[] })
    ).rejects.toThrow();
  });

  it("validates confirmed transaction schema (requires checksum)", async () => {
    await expect(
      caller.imports.executeImport({
        transactions: [
          {
            date: "2026-02-13",
            description: "TEST",
            amount: -100,
            account: "Amex",
            rawRow: "{}",
            // Missing checksum intentionally — tests runtime Zod validation
          } as ConfirmedTransaction,
        ],
      })
    ).rejects.toThrow();
  });

  it("executes valid input successfully", async () => {
    const { sessionId } = await caller.imports.executeImport({
      transactions: [
        {
          date: "2026-02-13",
          description: "WOOLWORTHS",
          amount: -125.5,
          account: "Amex",
          location: "Sydney",
          online: false,
          rawRow: "{}",
          checksum: "abc123",
          entityId: "woolworths-id",
          entityName: "Woolworths",
          entityUrl: "https://www.notion.so/woolworthsid",
        },
      ],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);
  }, 10000);

  it("returns correct output structure", async () => {
    const { sessionId } = await caller.imports.executeImport({
      transactions: [],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result).toHaveProperty("imported");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("skipped");
    expect(typeof result.imported).toBe("number");
    expect(Array.isArray(result.failed)).toBe(true);
  });

  it.skip("handles Notion API errors gracefully", async () => {
    // TODO: Update shared mock to support error injection for specific tests
    const { sessionId } = await caller.imports.executeImport({
      transactions: [
        {
          date: "2026-02-13",
          description: "TEST",
          amount: -100,
          account: "Amex",
          rawRow: "{}",
          checksum: "abc123",
          entityId: "entity-id",
          entityName: "Entity",
          entityUrl: "https://notion.so/entity",
        },
      ],
    });

    const result = await waitForCompletion<ExecuteImportOutput>(sessionId);
    expect(result).toBeDefined();

    expect(result.imported).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].error).toBe("Notion API error");
  }, 10000);
});

describe("imports.createEntity", () => {
  it("validates input schema (requires name)", async () => {
    await expect(caller.imports.createEntity({} as { name: string })).rejects.toThrow();
  });

  it("validates name is non-empty string", async () => {
    await expect(
      caller.imports.createEntity({
        name: "",
      })
    ).rejects.toThrow();
  });

  it("creates entity successfully", async () => {
    const result = await caller.imports.createEntity({
      name: "New Merchant",
    });

    expect(result.entityId).toBeDefined();
    expect(result.entityId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(result.entityName).toBe("New Merchant");
    expect(result.entityUrl).toMatch(/^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/);
  });

  it("returns correct output structure", async () => {
    const result = await caller.imports.createEntity({
      name: "Test Entity",
    });

    expect(result).toHaveProperty("entityId");
    expect(result).toHaveProperty("entityName");
    expect(result).toHaveProperty("entityUrl");
  });

  it("handles entity names with special characters", async () => {
    const result = await caller.imports.createEntity({
      name: "McDonald's Café & Grill",
    });

    expect(result.entityName).toBe("McDonald's Café & Grill");
  });

  it("handles very long entity names", async () => {
    const longName = "A".repeat(200);
    const result = await caller.imports.createEntity({
      name: longName,
    });

    expect(result.entityName).toBe(longName);
  });

  it.skip("throws error when Notion API fails", async () => {
    // TODO: Update shared mock to support error injection for specific tests
    await expect(
      caller.imports.createEntity({
        name: "Test Entity",
      })
    ).rejects.toThrow("Notion API error");
  });

  it("inserts entity into SQLite", async () => {
    const result = await caller.imports.createEntity({
      name: "SQLite Test Entity",
    });

    const row = db.prepare("SELECT * FROM entities WHERE id = ?").get(result.entityId);
    expect(row).toBeDefined();
    expect((row as EntityRow).name).toBe("SQLite Test Entity");
  });
});

describe("imports router - Authorization", () => {
  it("allows authenticated requests (processImport)", async () => {
    await expect(
      caller.imports.processImport({
        transactions: [],
        account: "Amex",
      })
    ).resolves.toBeDefined();
  });

  it("allows authenticated requests (executeImport)", async () => {
    await expect(
      caller.imports.executeImport({
        transactions: [],
      })
    ).resolves.toBeDefined();
  });

  it("allows authenticated requests (createEntity)", async () => {
    await expect(
      caller.imports.createEntity({
        name: "Test",
      })
    ).resolves.toBeDefined();
  });

  it("rejects unauthenticated requests", async () => {
    const unauthCaller = createCaller(false);

    await expect(
      unauthCaller.imports.processImport({
        transactions: [],
        account: "Amex",
      })
    ).rejects.toThrow(TRPCError);

    await expect(
      unauthCaller.imports.processImport({
        transactions: [],
        account: "Amex",
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
