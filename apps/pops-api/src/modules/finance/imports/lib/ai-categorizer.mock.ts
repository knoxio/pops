/**
 * Mock AI categorizer for testing.
 * Uses a lookup table for deterministic, predictable results.
 * Allows testing various AI response scenarios (good, bad, edge cases).
 */
import type { AiCacheEntry, AiUsageStats } from "./ai-categorizer.js";

/**
 * Lookup table for known descriptions.
 * Add new entries here as you discover edge cases in testing.
 */
const CATEGORIZATION_LOOKUP: Record<string, AiCacheEntry> = {
  // Groceries
  "WOOLWORTHS 1234": {
    description: "WOOLWORTHS 1234",
    entityName: "Woolworths",
    category: "Groceries",
    cachedAt: new Date().toISOString(),
  },
  WOOLWORTHS: {
    description: "WOOLWORTHS",
    entityName: "Woolworths",
    category: "Groceries",
    cachedAt: new Date().toISOString(),
  },
  "COLES 5678": {
    description: "COLES 5678",
    entityName: "Coles",
    category: "Groceries",
    cachedAt: new Date().toISOString(),
  },
  "ALDI STORES": {
    description: "ALDI STORES",
    entityName: "Aldi",
    category: "Groceries",
    cachedAt: new Date().toISOString(),
  },

  // Dining
  MCDONALDS: {
    description: "MCDONALDS",
    entityName: "McDonald's",
    category: "Dining",
    cachedAt: new Date().toISOString(),
  },
  "ROASTVILLE CAFE": {
    description: "ROASTVILLE CAFE",
    entityName: "Roastville Cafe",
    category: "Dining",
    cachedAt: new Date().toISOString(),
  },

  // Subscriptions
  "netflix.com": {
    description: "netflix.com",
    entityName: "Netflix",
    category: "Subscriptions",
    cachedAt: new Date().toISOString(),
  },
  SPOTIFY: {
    description: "SPOTIFY",
    entityName: "Spotify",
    category: "Subscriptions",
    cachedAt: new Date().toISOString(),
  },

  // Transport
  "SHELL COLES EXPRESS": {
    description: "SHELL COLES EXPRESS",
    entityName: "Shell",
    category: "Transport",
    cachedAt: new Date().toISOString(),
  },

  // Shopping
  "AMAZON AU": {
    description: "AMAZON AU",
    entityName: "Amazon AU",
    category: "Shopping",
    cachedAt: new Date().toISOString(),
  },
  "JB HI-FI": {
    description: "JB HI-FI",
    entityName: "JB Hi-Fi",
    category: "Shopping",
    cachedAt: new Date().toISOString(),
  },

  // Edge cases - these test UI handling of poor AI responses
  "TEST AMBIGUOUS MERCHANT": {
    description: "TEST AMBIGUOUS MERCHANT",
    entityName: "Test", // Vague entity name
    category: "Other",
    cachedAt: new Date().toISOString(),
  },
  "UNKNOWN MERCHANT XYZ": {
    description: "UNKNOWN MERCHANT XYZ",
    entityName: "Unknown", // AI couldn't determine
    category: "Other",
    cachedAt: new Date().toISOString(),
  },
};

/**
 * Mock behavior configuration.
 * Set these in tests to simulate different AI responses.
 */
export const mockConfig = {
  /** Return null for all requests (AI unavailable) */
  alwaysReturnNull: false,
  /** Throw API error */
  throwError: false,
  /** Error type to throw */
  errorType: "API_ERROR" as "NO_API_KEY" | "API_ERROR" | "INSUFFICIENT_CREDITS",
  /** Return bad JSON (malformed response) */
  returnBadJson: false,
  /** Return result with missing fields */
  returnIncompleteData: false,
  /** Custom lookup table for specific test */
  customLookup: null as Record<string, AiCacheEntry> | null,
};

/**
 * Reset mock to default state.
 * Call this in beforeEach to ensure clean state.
 */
export function resetMockAi(): void {
  mockConfig.alwaysReturnNull = false;
  mockConfig.throwError = false;
  mockConfig.errorType = "API_ERROR";
  mockConfig.returnBadJson = false;
  mockConfig.returnIncompleteData = false;
  mockConfig.customLookup = null;
}

/**
 * Pattern-based fallback for unknown descriptions.
 * Returns a generic categorization based on keywords.
 */
function categorizeByPattern(description: string): AiCacheEntry {
  const upper = description.toUpperCase();

  // Groceries
  if (upper.includes("WOOLWORTHS") || upper.includes("COLES") || upper.includes("ALDI")) {
    return {
      description,
      entityName: "Grocery Store",
      category: "Groceries",
      cachedAt: new Date().toISOString(),
    };
  }

  // Dining
  if (upper.includes("CAFE") || upper.includes("RESTAURANT") || upper.includes("MCDONALD")) {
    return {
      description,
      entityName: "Restaurant",
      category: "Dining",
      cachedAt: new Date().toISOString(),
    };
  }

  // Transport
  if (
    upper.includes("SHELL") ||
    upper.includes("BP") ||
    upper.includes("FUEL") ||
    upper.includes("PETROL")
  ) {
    return {
      description,
      entityName: "Fuel Station",
      category: "Transport",
      cachedAt: new Date().toISOString(),
    };
  }

  // Default fallback
  return {
    description,
    entityName: "Unknown Merchant",
    category: "Other",
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Mock implementation of categorizeWithAi.
 * Uses lookup table for deterministic results.
 */
export async function mockCategorizeWithAi(
  rawRow: string,
  _importBatchId?: string
): Promise<{ result: AiCacheEntry | null; usage?: AiUsageStats }> {
  // Simulate error scenarios
  if (mockConfig.throwError) {
    const { AiCategorizationError } = await import("./ai-categorizer.js");
    throw new AiCategorizationError("Mock AI error", mockConfig.errorType);
  }

  // Simulate null response (AI unavailable)
  if (mockConfig.alwaysReturnNull) {
    return { result: null };
  }

  // Simulate bad JSON response
  if (mockConfig.returnBadJson) {
    throw new Error("Unexpected token 'T', \"This is not JSON\" is not valid JSON");
  }

  const key = rawRow.toUpperCase().trim();

  // Check custom lookup first (for test-specific scenarios)
  if (mockConfig.customLookup && mockConfig.customLookup[key]) {
    const result = mockConfig.customLookup[key];
    return {
      result,
      usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.00015 },
    };
  }

  // Check standard lookup table
  if (CATEGORIZATION_LOOKUP[key]) {
    const result = CATEGORIZATION_LOOKUP[key];

    // Simulate incomplete data response
    if (mockConfig.returnIncompleteData) {
      return {
        result: {
          description: result.description,
          entityName: "", // Missing!
          category: result.category,
          cachedAt: result.cachedAt,
        },
        usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.00015 },
      };
    }

    return {
      result,
      usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.00015 },
    };
  }

  // Fallback to pattern matching
  const result = categorizeByPattern(rawRow);
  return {
    result,
    usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.00015 },
  };
}
