import type { ProcessedTransaction } from "@pops/finance-api/modules/imports";

/**
 * Transaction group for displaying similar transactions together
 */
export interface TransactionGroup {
  entityName: string;
  category?: string;
  transactions: ProcessedTransaction[];
  aiSuggestion: boolean;
}

/**
 * Clean description for fuzzy matching by removing numbers and normalizing spaces
 */
export function cleanDescription(desc: string): string {
  return desc
    .replace(/\d+/g, "") // Remove numbers
    .replace(/\s+/g, " ") // Normalize spaces
    .trim()
    .toUpperCase();
}

/**
 * Find transactions with similar descriptions (same merchant, different numbers/locations)
 */
export function findSimilarTransactions(
  reference: ProcessedTransaction,
  candidates: ProcessedTransaction[]
): ProcessedTransaction[] {
  return candidates.filter((candidate) => {
    // Skip already resolved transactions
    if (candidate.entity?.entityId) return false;

    // Skip the reference transaction itself
    if (candidate === reference) return false;

    // Exact match
    if (candidate.description === reference.description) return true;

    // Fuzzy match: same merchant, different numbers/locations
    const refClean = cleanDescription(reference.description);
    const candClean = cleanDescription(candidate.description);
    return refClean === candClean && refClean.length > 0;
  });
}

/**
 * Group transactions by AI-suggested entity name
 */
export function groupTransactionsByEntity(
  transactions: ProcessedTransaction[]
): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>();

  for (const transaction of transactions) {
    const key = transaction.entity?.entityName || "unknown";
    if (!groups.has(key)) {
      groups.set(key, {
        entityName: transaction.entity?.entityName || "Unknown",
        category: undefined, // Category will be fetched from entities list if needed
        transactions: [],
        aiSuggestion: transaction.entity?.matchType === "ai",
      });
    }
    groups.get(key)!.transactions.push(transaction);
  }

  // Sort: AI suggestions first, then by transaction count descending
  return Array.from(groups.values()).sort((a, b) => {
    if (a.aiSuggestion !== b.aiSuggestion) return a.aiSuggestion ? -1 : 1;
    return b.transactions.length - a.transactions.length;
  });
}

/**
 * Location details for displaying location source information
 */
export interface LocationDetails {
  location: string | null;
  source: "csv" | "entity-match" | "manual" | null;
  extractedFrom?: string; // Raw CSV field value
  confidence?: "high" | "medium" | "low";
}

/**
 * Extract location details from transaction
 */
export function extractLocationDetails(
  transaction: ProcessedTransaction
): LocationDetails {
  if (!transaction.location) {
    return {
      location: null,
      source: null,
    };
  }

  // Try to parse rawRow to detect location source
  try {
    const rawRow = JSON.parse(transaction.rawRow) as Record<string, string>;

    // Check common CSV location field names
    const locationFields = [
      "Town/City",
      "location",
      "Location",
      "City",
      "city",
    ];
    for (const field of locationFields) {
      if (rawRow[field] && rawRow[field].trim().length > 0) {
        return {
          location: transaction.location,
          source: "csv",
          extractedFrom: `${field}: ${rawRow[field]}`,
          confidence: "high",
        };
      }
    }

    // If location exists but not found in CSV, assume entity match
    return {
      location: transaction.location,
      source: "entity-match",
      confidence: "medium",
    };
  } catch {
    // Failed to parse rawRow, return basic info
    return {
      location: transaction.location,
      source: null,
      confidence: "low",
    };
  }
}
