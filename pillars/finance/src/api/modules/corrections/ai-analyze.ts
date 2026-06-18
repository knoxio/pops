/**
 * AI rule derivation: `analyzeCorrection` (one signal → a validated rule) and
 * `generateRules` (a batch of transactions → proposed tagging rules). Ported
 * from the monolith `core/corrections/lib/{analyze-correction,rule-generator}.ts`,
 * routed through the injectable Claude completer (`ai-runtime.ts`).
 */
import { type FinanceDb, transactions, transactionCorrectionsService } from '../../../db/index.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { type CorrectionAnalysis, type ProposedRule } from './ai-types.js';
import { parseCorrectionTags } from './types.js';

const MIN_PATTERN_LENGTH = 3;
const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;

export interface CorrectionInput {
  description: string;
  entityName: string;
  amount: number;
}

export interface GenerateRulesTransaction {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

function patternMatchesDescription(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex',
  description: string
): boolean {
  const { normalizeDescription } = transactionCorrectionsService;
  const normalizedDescription = normalizeDescription(description);
  const normalizedPattern = matchType === 'regex' ? pattern : normalizeDescription(pattern);
  if (normalizedPattern.length === 0) return false;
  if (matchType === 'exact') return normalizedPattern === normalizedDescription;
  if (matchType === 'contains') return normalizedDescription.includes(normalizedPattern);
  try {
    return new RegExp(normalizedPattern).test(normalizedDescription);
  } catch {
    return false;
  }
}

function stripFences(text: string): string {
  return text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
}

function buildAnalyzePrompt(input: CorrectionInput): string {
  return `You are a bank transaction pattern analyzer. A user has assigned a transaction to an entity and we need a reusable rule that will identify FUTURE transactions belonging to the same entity.

Transaction description: "${input.description}"
Entity (context only — may not appear in the description): "${input.entityName}"
Amount: ${input.amount}

Pick a stable identifier from the description (merchant token, keyword). Strip volatile parts (numeric codes, dates, amounts). The entity name is context only — do not put it in the pattern unless it literally appears in the description.

Return a single JSON object:
- "matchType": "exact" | "contains" | "regex"
- "pattern": the matching pattern (min ${MIN_PATTERN_LENGTH} chars, uppercase); for exact/contains it must appear verbatim (case-insensitive) in the description; for regex it must test true against the description.
- "confidence": 0.0-1.0

Return ONLY the JSON object, no markdown.`;
}

function parseAnalysis(text: string): CorrectionAnalysis | null {
  try {
    const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
    const matchType = typeof parsed['matchType'] === 'string' ? parsed['matchType'] : '';
    const pattern = typeof parsed['pattern'] === 'string' ? parsed['pattern'] : '';
    const confidence = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0;
    if (
      !MATCH_TYPES.includes(matchType as (typeof MATCH_TYPES)[number]) ||
      pattern.length < MIN_PATTERN_LENGTH ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    return { matchType: matchType as CorrectionAnalysis['matchType'], pattern, confidence };
  } catch {
    return null;
  }
}

/** Derive + validate a correction rule from one labelled transaction. Null when the AI is unavailable or proposes a non-matching pattern. */
export async function analyzeCorrection(
  input: CorrectionInput
): Promise<CorrectionAnalysis | null> {
  const text = await getClaudeCompleter()({
    prompt: buildAnalyzePrompt(input),
    maxTokens: 200,
    operation: 'analyze-correction',
  });
  if (!text) return null;
  const result = parseAnalysis(text);
  if (!result) return null;
  if (!patternMatchesDescription(result.pattern, result.matchType, input.description)) return null;
  return result;
}

function loadAvailableTags(db: FinanceDb): string[] {
  const rows = db.select({ tags: transactions.tags }).from(transactions).all();
  const seen = new Set<string>();
  for (const row of rows) {
    for (const tag of parseCorrectionTags(row.tags ?? '[]')) seen.add(tag);
  }
  return [...seen].toSorted();
}

function buildGeneratePrompt(txns: GenerateRulesTransaction[], availableTags: string[]): string {
  const lines = txns
    .map((t, i) => {
      const entity = t.entityName ?? 'unknown';
      const tags = t.currentTags.length > 0 ? t.currentTags.join(', ') : 'none';
      return `${i + 1}. "${t.description}" | entity: ${entity} | amount: ${t.amount} | account: ${t.account} | current tags: ${tags}`;
    })
    .join('\n');
  const tagList =
    availableTags.length > 0 ? availableTags.join(', ') : 'common financial categories';
  return `You are a transaction categorization assistant. Propose reusable tagging rules for these transactions.

Available tags: ${tagList}

Transactions:
${lines}

Return a JSON array; each rule: {"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["Tag1"],"reasoning":"..."}.
Return ONLY the JSON array, no markdown.`;
}

function parseProposals(text: string): ProposedRule[] {
  try {
    const parsed = JSON.parse(stripFences(text)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        descriptionPattern:
          typeof item['descriptionPattern'] === 'string' ? item['descriptionPattern'] : '',
        matchType: (MATCH_TYPES.includes(String(item['matchType']) as (typeof MATCH_TYPES)[number])
          ? item['matchType']
          : 'contains') as ProposedRule['matchType'],
        tags: Array.isArray(item['tags'])
          ? item['tags'].filter((t): t is string => typeof t === 'string')
          : [],
        reasoning: typeof item['reasoning'] === 'string' ? item['reasoning'] : '',
      }))
      .filter((p) => p.descriptionPattern.length > 0);
  } catch {
    return [];
  }
}

/** Batch-propose reusable tagging rules from a set of transactions. */
export async function generateRules(
  db: FinanceDb,
  txns: GenerateRulesTransaction[]
): Promise<ProposedRule[]> {
  const text = await getClaudeCompleter()({
    prompt: buildGeneratePrompt(txns, loadAvailableTags(db)),
    maxTokens: 2000,
    operation: 'generate-rules',
  });
  if (!text) return [];
  return parseProposals(text);
}
