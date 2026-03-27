/**
 * LLM-powered rule generator for transaction tagging corrections.
 * Calls Claude Haiku with a batch of transactions to propose reusable tagging rules.
 * Uses the same withRateLimitRetry / ai_usage tracking pattern as ai-categorizer.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, isNotNull, ne } from "drizzle-orm";
import { getEnv } from "../../../../env.js";
import { getDrizzle } from "../../../../db.js";
import { aiUsage, transactions as transactionsTable } from "@pops/db-types";
import { logger } from "../../../../lib/logger.js";

/**
 * Load all distinct tag values from existing transactions.
 * Used to inform LLM prompts with real tags from the database.
 */
function loadAvailableTagsFromDb(): string[] {
  try {
    const rows = getDrizzle()
      .select({ tags: transactionsTable.tags })
      .from(transactionsTable)
      .where(and(isNotNull(transactionsTable.tags), ne(transactionsTable.tags, "[]")))
      .all();

    const tagSet = new Set<string>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.tags) as unknown;
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            if (typeof t === "string" && t.trim()) tagSet.add(t.trim());
          }
        }
      } catch {
        // malformed JSON — ignore
      }
    }
    return [...tagSet].sort();
  } catch {
    return [];
  }
}

export interface ProposedRule {
  descriptionPattern: string;
  matchType: "exact" | "contains" | "regex";
  tags: string[];
  reasoning: string;
}

export interface CorrectionAnalysis {
  matchType: "exact" | "prefix" | "contains";
  pattern: string;
  confidence: number;
}

interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
  account: string;
}

interface TransactionInput {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

async function withRateLimitRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error instanceof Error && "status" in error && (error as { status: number }).status === 429;

      if (!isRateLimit || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      logger.warn(
        { context, attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: Math.round(delay) },
        "[RuleGen] Rate limited (429) — retrying with backoff"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Generate proposed tagging correction rules from a batch of transactions.
 * Returns proposals without saving — caller must confirm via corrections.createOrUpdate.
 */
export async function generateRules(transactions: TransactionInput[]): Promise<ProposedRule[]> {
  const apiKey = getEnv("CLAUDE_API_KEY");
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  const transactionLines = transactions
    .map((t, i) => {
      const entity = t.entityName ?? "unknown";
      const tags = t.currentTags.length > 0 ? t.currentTags.join(", ") : "none";
      return `${i + 1}. "${t.description}" | entity: ${entity} | amount: ${t.amount} | account: ${t.account} | current tags: ${tags}`;
    })
    .join("\n");

  const availableTags = loadAvailableTagsFromDb();
  const tagListStr =
    availableTags.length > 0 ? availableTags.join(", ") : "common financial categories";

  const prompt = `You are a transaction categorization assistant. Given these bank transactions, propose reusable tagging rules that could apply to similar transactions in the future.

Available tags: ${tagListStr}

Transactions:
${transactionLines}

Return a JSON array of proposed rules. Each rule should:
- Have a short description_pattern (the key merchant/description fragment to match)
- Specify match_type: "exact" (full normalized match), "contains" (pattern appears in description), or "regex"
- List relevant tags from the available tags list
- Include brief reasoning

Format:
[{"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["Tag1","Tag2"],"reasoning":"..."}]

Return ONLY the JSON array, no markdown, no explanation.`;

  const response = await withRateLimitRetry(
    () =>
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    "generateRules"
  );

  const text = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!text) return [];

  const cleanedText = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "");

  let proposals: ProposedRule[];
  try {
    const parsed = JSON.parse(cleanedText) as unknown;
    if (!Array.isArray(parsed)) return [];

    proposals = parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item)
      )
      .map((item) => ({
        descriptionPattern:
          typeof item["descriptionPattern"] === "string" ? item["descriptionPattern"] : "",
        matchType: (["exact", "contains", "regex"].includes(String(item["matchType"]))
          ? item["matchType"]
          : "contains") as "exact" | "contains" | "regex",
        tags: Array.isArray(item["tags"])
          ? (item["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
          : [],
        reasoning: typeof item["reasoning"] === "string" ? item["reasoning"] : "",
      }))
      .filter((p) => p.descriptionPattern.length > 0);
  } catch {
    logger.error({ text: cleanedText }, "[RuleGen] Failed to parse LLM response");
    return [];
  }

  // Track AI usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

  try {
    getDrizzle()
      .insert(aiUsage)
      .values({
        description: `generateRules (${transactions.length} transactions)`,
        entityName: null,
        category: "rule-generation",
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    // ai_usage tracking is best-effort — don't fail the request
  }

  logger.info(
    { count: proposals.length, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    "[RuleGen] Generated rules"
  );

  return proposals;
}

const MIN_PATTERN_LENGTH = 3;

/**
 * Analyze a single user correction to suggest a matching pattern.
 * Returns null if AI is unavailable or the suggestion is invalid.
 */
export async function analyzeCorrection(
  input: CorrectionInput
): Promise<CorrectionAnalysis | null> {
  const apiKey = getEnv("CLAUDE_API_KEY");
  if (!apiKey) {
    logger.warn("[RuleGen] CLAUDE_API_KEY not configured — skipping correction analysis");
    return null;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  const prompt = `You are a bank transaction pattern analyzer. A user has corrected a transaction by assigning it to an entity. Analyze the description to suggest a reusable matching pattern.

Transaction description: "${input.description}"
Assigned entity: "${input.entityName}"
Amount: ${input.amount}
Account: ${input.account}

Identify which part of the description is the entity/merchant name versus location, branch, reference numbers, or noise.

Return a single JSON object:
- "matchType": "exact" (full description matches), "prefix" (description starts with pattern), or "contains" (pattern found anywhere in description)
- "pattern": the matching pattern string (min ${MIN_PATTERN_LENGTH} chars, uppercase)
- "confidence": 0.0-1.0 (how confident you are this pattern will correctly match future transactions for this entity)

Guidelines:
- "IKEA TEMPE NSW" → entity is "IKEA", location is "TEMPE NSW" → prefix match on "IKEA"
- "PAYMENT TO NETFLIX" → entity is "NETFLIX", prefix is "PAYMENT TO" → contains match on "NETFLIX"
- "WOOLWORTHS 1234 SYDNEY" → entity is "WOOLWORTHS", rest is branch/location → prefix match on "WOOLWORTHS"
- Prefer prefix over contains when the entity name starts the description
- Prefer contains when the entity name appears after a generic prefix
- Use exact only when the full description is a consistent identifier

Return ONLY the JSON object, no markdown, no explanation.`;

  let response;
  try {
    response = await withRateLimitRetry(
      () =>
        client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      "analyzeCorrection"
    );
  } catch (error) {
    logger.error({ error }, "[RuleGen] AI call failed for correction analysis");
    return null;
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!text) return null;

  const cleanedText = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "");

  let result: CorrectionAnalysis | null = null;
  try {
    const parsed = JSON.parse(cleanedText) as Record<string, unknown>;

    const rawMatchType = parsed["matchType"];
    const rawPattern = parsed["pattern"];
    const rawConfidence = parsed["confidence"];

    const matchType = typeof rawMatchType === "string" ? rawMatchType : "";
    const pattern = typeof rawPattern === "string" ? rawPattern : "";
    const confidence = typeof rawConfidence === "number" ? rawConfidence : 0;

    if (
      !["exact", "prefix", "contains"].includes(matchType) ||
      pattern.length < MIN_PATTERN_LENGTH ||
      confidence < 0 ||
      confidence > 1
    ) {
      logger.warn({ parsed }, "[RuleGen] Invalid correction analysis response");
      return null;
    }

    result = {
      matchType: matchType as "exact" | "prefix" | "contains",
      pattern,
      confidence,
    };
  } catch {
    logger.error({ text: cleanedText }, "[RuleGen] Failed to parse correction analysis response");
    return null;
  }

  // Track AI usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

  try {
    getDrizzle()
      .insert(aiUsage)
      .values({
        description: `analyzeCorrection: "${input.description}" → "${input.entityName}"`,
        entityName: input.entityName,
        category: "correction-analysis",
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    // ai_usage tracking is best-effort
  }

  logger.info(
    { result, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    "[RuleGen] Correction analysis complete"
  );

  return result;
}
