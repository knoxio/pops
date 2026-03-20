/**
 * Example tests demonstrating how to use the AI categorizer mock.
 * Shows how to test different AI response scenarios.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockCategorizeWithAi, resetMockAi, mockConfig } from "./ai-categorizer.mock.js";

describe("AI Categorizer Mock Examples", () => {
  beforeEach(() => {
    resetMockAi();
  });

  describe("Standard lookup behavior", () => {
    it("returns categorization for known descriptions", async () => {
      const result = await mockCategorizeWithAi("WOOLWORTHS 1234");

      expect(result.result).toEqual({
        description: "WOOLWORTHS 1234",
        entityName: "Woolworths",
        category: "Groceries",
        cachedAt: expect.any(String),
      });
      expect(result.usage).toBeDefined();
    });

    it("uses pattern matching for unknown descriptions", async () => {
      const result = await mockCategorizeWithAi("COLES SUPERMARKET UNKNOWN BRANCH");

      expect(result.result?.entityName).toBe("Grocery Store");
      expect(result.result?.category).toBe("Groceries");
    });
  });

  describe("Simulating AI failures", () => {
    it("returns null when AI is unavailable", async () => {
      mockConfig.alwaysReturnNull = true;

      const result = await mockCategorizeWithAi("WOOLWORTHS 1234");

      expect(result.result).toBeNull();
    });

    it("throws API error", async () => {
      mockConfig.throwError = true;
      mockConfig.errorType = "API_ERROR";

      await expect(mockCategorizeWithAi("WOOLWORTHS 1234")).rejects.toThrow("Mock AI error");
    });

    it("throws insufficient credits error", async () => {
      mockConfig.throwError = true;
      mockConfig.errorType = "INSUFFICIENT_CREDITS";

      await expect(mockCategorizeWithAi("WOOLWORTHS 1234")).rejects.toThrow("Mock AI error");
    });

    it("throws bad JSON error", async () => {
      mockConfig.returnBadJson = true;

      await expect(mockCategorizeWithAi("WOOLWORTHS 1234")).rejects.toThrow("is not valid JSON");
    });
  });

  describe("Simulating poor AI responses", () => {
    it("returns incomplete data (missing entity name)", async () => {
      mockConfig.returnIncompleteData = true;

      const result = await mockCategorizeWithAi("WOOLWORTHS 1234");

      expect(result.result?.entityName).toBe("");
      expect(result.result?.category).toBe("Groceries");
    });

    it("returns vague entity name (edge case in lookup)", async () => {
      const result = await mockCategorizeWithAi("TEST AMBIGUOUS MERCHANT");

      expect(result.result?.entityName).toBe("Test"); // Vague!
      expect(result.result?.category).toBe("Other");
    });
  });

  describe("Custom test scenarios", () => {
    it("uses custom lookup for specific test", async () => {
      // Set up custom categorization for this test
      mockConfig.customLookup = {
        "MY CUSTOM MERCHANT": {
          description: "MY CUSTOM MERCHANT",
          entityName: "Custom Test Entity",
          category: "Custom Category",
          cachedAt: new Date().toISOString(),
        },
      };

      const result = await mockCategorizeWithAi("MY CUSTOM MERCHANT");

      expect(result.result?.entityName).toBe("Custom Test Entity");
      expect(result.result?.category).toBe("Custom Category");
    });

    it("tests UI handling of unusual categories", async () => {
      mockConfig.customLookup = {
        "WEIRD MERCHANT": {
          description: "WEIRD MERCHANT",
          entityName: "Weird Store",
          category: "🎉 Unusual Category!", // Test UI with emoji/special chars
          cachedAt: new Date().toISOString(),
        },
      };

      const result = await mockCategorizeWithAi("WEIRD MERCHANT");

      expect(result.result?.category).toBe("🎉 Unusual Category!");
    });
  });
});
