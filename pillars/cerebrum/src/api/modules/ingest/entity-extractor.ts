/**
 * CortexEntityExtractor — extract people, projects, dates, topics, and
 * organisations from engram content (ingestion-pipeline).
 *
 * The LLM call goes through an injected {@link IngestLlm} port; the confidence
 * threshold is a hardcoded constant (no settings service). Entities above the
 * threshold become prefixed tags (e.g. `person:alice`, `project:karbon`).
 */
import { type IngestLlm } from './llm.js';

import type { EntityExtractionResult, EntityType, ExtractedEntity } from './types.js';

const OPERATION = 'cerebrum.extract-entities';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 512;

const ENTITY_TYPES: EntityType[] = ['person', 'project', 'date', 'topic', 'organisation'];

interface LlmEntity {
  type: EntityType;
  value: string;
  normalised: string;
  confidence: number;
}

function buildPrompt(body: string, existingTags: string[], referenceDate: string): string {
  const tagsSection =
    existingTags.length > 0
      ? `\nExisting tags (do not duplicate): ${existingTags.join(', ')}\n`
      : '';
  const dateContext = `\nReference date for resolving relative dates: ${referenceDate}\n`;

  return `Extract named entities from the following content. Focus on:
- person: Named individuals (e.g. "Alice Smith", "Bob")
- project: Projects, products, codebases, or workstreams (e.g. "Karbon", "Project Phoenix")
- date: Specific dates or time references (e.g. "Q1 2025", "next Monday", "2025-03-15")
- topic: Key subject areas or concepts (e.g. "machine learning", "tax return")
- organisation: Companies, teams, institutions (e.g. "Anthropic", "Finance team")
${tagsSection}${dateContext}
Content:
---
${body.slice(0, 4000)}${body.length > 4000 ? '\n...[truncated]' : ''}
---

Return a JSON array only (no markdown, no explanation outside JSON):
[
  {
    "type": "<person|project|date|topic|organisation>",
    "value": "<original text>",
    "normalised": "<normalised form: ISO 8601 for dates, lowercase for topics, Title Case for proper nouns>",
    "confidence": <float 0.0-1.0>
  }
]

Rules:
- Include 0-15 entities total
- Normalise ALL dates to ISO 8601 (YYYY-MM-DD). Resolve relative dates against the reference date
- For date ranges or quarters, use the start date (e.g. "Q1 2025" → "2025-01-01")
- Name capitalisation: Title Case for people and orgs, lowercase for topics
- Omit low-confidence (<0.5) entities entirely
- Omit generic terms ("system", "user", "data")`;
}

function parseEntity(item: unknown): LlmEntity | null {
  if (typeof item !== 'object' || item === null) return null;
  const obj = item as Record<string, unknown>;
  const type = obj['type'];
  if (typeof type !== 'string' || !ENTITY_TYPES.includes(type as EntityType)) return null;

  const value = typeof obj['value'] === 'string' ? obj['value'].trim() : '';
  if (!value) return null;

  const normalised =
    typeof obj['normalised'] === 'string' ? obj['normalised'].trim() : value.toLowerCase();
  const confidence =
    typeof obj['confidence'] === 'number' ? Math.min(1, Math.max(0, obj['confidence'])) : 0;

  return { type: type as EntityType, value, normalised, confidence };
}

function parseResponse(text: string): LlmEntity[] {
  const trimmed = text.trim();
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) return [];

  try {
    const raw = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as unknown[];
    return raw.flatMap((item) => {
      const entity = parseEntity(item);
      return entity ? [entity] : [];
    });
  } catch {
    return [];
  }
}

function toTag(entity: LlmEntity): string {
  return `${entity.type}:${entity.normalised}`;
}

/** ISO 8601 date pattern: YYYY-MM-DD (with optional time component). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function collectReferencedDates(entities: LlmEntity[]): string[] {
  const dates = new Set<string>();
  for (const e of entities) {
    if (e.type !== 'date') continue;
    const match = ISO_DATE_RE.exec(e.normalised);
    if (match) dates.add(match[0]);
  }
  return [...dates].toSorted();
}

function dedupeEntities(entities: LlmEntity[], existingTags: string[]): LlmEntity[] {
  const existingSet = new Set(existingTags.map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  return entities.filter((e) => {
    const tag = toTag(e).toLowerCase();
    if (seen.has(tag) || existingSet.has(tag)) return false;
    seen.add(tag);
    return true;
  });
}

export class CortexEntityExtractor {
  private readonly llm: IngestLlm;
  private readonly confidenceThreshold: number;

  constructor(llm: IngestLlm, options?: { confidenceThreshold?: number }) {
    this.llm = llm;
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  /**
   * @param body          Engram body content.
   * @param existingTags  Tags already assigned (for dedup).
   * @param referenceDate ISO 8601 date for resolving relative dates. Defaults to today.
   */
  async extract(
    body: string,
    existingTags: string[] = [],
    referenceDate?: string
  ): Promise<EntityExtractionResult> {
    const refDate = referenceDate ?? new Date().toISOString().slice(0, 10);
    const text = await this.llm.complete({
      operation: OPERATION,
      model: this.llm.modelFor('entityExtractor'),
      prompt: buildPrompt(body, existingTags, refDate),
      maxTokens: MAX_TOKENS,
    });

    if (text === null) return { entities: [], tags: [], referencedDates: [] };

    const rawEntities = parseResponse(text);
    const aboveThreshold = rawEntities.filter((e) => e.confidence >= this.confidenceThreshold);
    const deduped = dedupeEntities(aboveThreshold, existingTags);

    const entities: ExtractedEntity[] = deduped.map((e) => ({
      type: e.type,
      value: e.value,
      normalised: e.normalised,
      confidence: e.confidence,
    }));

    return {
      entities,
      tags: deduped.map(toTag),
      referencedDates: collectReferencedDates(deduped),
    };
  }
}
