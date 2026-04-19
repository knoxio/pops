/**
 * CortexEntityExtractor — extract people, projects, dates, topics, and
 * organisations from engram content (PRD-081 US-05).
 *
 * Entities that pass the confidence threshold are converted into prefixed
 * tags (e.g. person:Alice, project:karbon) for storage in the engram.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';

import type { EntityExtractionResult, EntityType, ExtractedEntity } from './types.js';

const MODEL = 'claude-haiku-4-5-20251001';
const OPERATION = 'cerebrum.extract-entities';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

const ENTITY_TYPES: EntityType[] = ['person', 'project', 'date', 'topic', 'organisation'];

interface LlmEntity {
  type: EntityType;
  value: string;
  normalised: string;
  confidence: number;
}

function buildPrompt(body: string, existingTags: string[]): string {
  const tagsSection =
    existingTags.length > 0
      ? `\nExisting tags (do not duplicate): ${existingTags.join(', ')}\n`
      : '';

  return `Extract named entities from the following content. Focus on:
- person: Named individuals (e.g. "Alice Smith", "Bob")
- project: Projects, products, codebases, or workstreams (e.g. "Karbon", "Project Phoenix")
- date: Specific dates or time references (e.g. "Q1 2025", "next Monday", "2025-03-15")
- topic: Key subject areas or concepts (e.g. "machine learning", "tax return")
- organisation: Companies, teams, institutions (e.g. "Anthropic", "Finance team")
${tagsSection}
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
- Normalise dates to ISO 8601 where possible (YYYY-MM-DD)
- Name capitalisation: Title Case for people and orgs, lowercase for topics
- Omit low-confidence (<0.5) entities entirely
- Omit generic terms ("system", "user", "data")`;
}

function parseResponse(text: string): LlmEntity[] {
  const trimmed = text.trim();
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) return [];

  try {
    const raw = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as unknown[];
    const entities: LlmEntity[] = [];

    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const type = obj['type'] as string;
      if (!ENTITY_TYPES.includes(type as EntityType)) continue;

      const value = typeof obj['value'] === 'string' ? obj['value'].trim() : '';
      if (!value) continue;

      const normalised =
        typeof obj['normalised'] === 'string' ? obj['normalised'].trim() : value.toLowerCase();
      const confidence =
        typeof obj['confidence'] === 'number' ? Math.min(1, Math.max(0, obj['confidence'])) : 0;

      entities.push({ type: type as EntityType, value, normalised, confidence });
    }

    return entities;
  } catch {
    return [];
  }
}

function toTag(entity: LlmEntity): string {
  return `${entity.type}:${entity.normalised}`;
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
  private readonly confidenceThreshold: number;

  constructor(options?: { confidenceThreshold?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  async extract(body: string, existingTags: string[] = []): Promise<EntityExtractionResult> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.warn('[CortexEntityExtractor] ANTHROPIC_API_KEY not set — skipping entity extraction');
      return { entities: [], tags: [] };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const prompt = buildPrompt(body, existingTags);

    let rawEntities: LlmEntity[];
    try {
      const response = await trackInference(
        { provider: 'claude', model: MODEL, operation: OPERATION, domain: 'cerebrum' },
        () =>
          withRateLimitRetry(
            () =>
              client.messages.create({
                model: MODEL,
                max_tokens: 512,
                temperature: 0,
                messages: [{ role: 'user', content: prompt }],
              }),
            OPERATION,
            { logger, logPrefix: '[CortexEntityExtractor]' }
          )
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]';
      rawEntities = parseResponse(text);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[CortexEntityExtractor] Extraction failed — returning empty'
      );
      return { entities: [], tags: [] };
    }

    const aboveThreshold = rawEntities.filter((e) => e.confidence >= this.confidenceThreshold);
    const deduped = dedupeEntities(aboveThreshold, existingTags);

    const entities: ExtractedEntity[] = deduped.map((e) => ({
      type: e.type,
      value: e.value,
      normalised: e.normalised,
      confidence: e.confidence,
    }));

    const tags = deduped.map(toTag);

    return { entities, tags };
  }
}
