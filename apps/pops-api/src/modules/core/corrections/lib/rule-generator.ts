/**
 * LLM-powered rule generator for transaction tagging corrections.
 * Calls Claude Haiku with a batch of transactions to propose reusable tagging rules.
 * Uses the same withRateLimitRetry / ai_usage tracking pattern as ai-categorizer.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../../../../env.js";
import { getDb } from "../../../../db.js";
import { logger } from "../../../../lib/logger.js";

/**
 * Load all distinct tag values from existing transactions.
 * Used to inform LLM prompts with real tags from the database.
 */
function loadAvailableTagsFromDb(): string[] {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT tags FROM transactions WHERE tags IS NOT NULL AND tags != '[]'")
      .all() as { tags: string }[];

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
    const db = getDb();
    db.prepare(
      `INSERT INTO ai_usage (description, entity_name, category, input_tokens, output_tokens, cost_usd, cached, import_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`
    ).run(
      `generateRules (${transactions.length} transactions)`,
      null,
      "rule-generation",
      inputTokens,
      outputTokens,
      costUsd,
      new Date().toISOString()
    );
  } catch {
    // ai_usage tracking is best-effort — don't fail the request
  }

  logger.info(
    { count: proposals.length, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    "[RuleGen] Generated rules"
  );

  return proposals;
}
