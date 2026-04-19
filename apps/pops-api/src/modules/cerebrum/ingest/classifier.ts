/**
 * CortexClassifier — LLM-based content type classification (PRD-081 US-04).
 *
 * Calls Claude Haiku at temperature 0 to classify an engram body into one of
 * the known content types, returning a confidence score and suggested tags.
 * Falls back to "capture" when confidence is below the configured threshold.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';

import type { ClassificationResult } from './types.js';

const MODEL = 'claude-haiku-4-5-20251001';
const OPERATION = 'cerebrum.classify';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const FALLBACK_TYPE = 'capture';

const KNOWN_TYPES = [
  'journal',
  'decision',
  'research',
  'meeting',
  'idea',
  'note',
  'capture',
] as const;

type KnownType = (typeof KNOWN_TYPES)[number];

interface LlmClassifyResponse {
  type: KnownType;
  confidence: number;
  template: string | null;
  suggested_tags: string[];
  reasoning?: string;
}

function buildPrompt(body: string, title?: string): string {
  const titleSection = title ? `Title: ${title}\n\n` : '';
  return `You are a content classifier for a personal knowledge management system. Classify the following content into one of these types:

- journal: Personal diary entries, daily reflections, emotional processing
- decision: Decision records, choices made with context and rationale
- research: Research notes, findings, literature reviews, technical investigation
- meeting: Meeting notes, agendas, action items, attendees
- idea: Creative ideas, brainstorming, concepts to explore
- note: Reference material, how-tos, general knowledge, links
- capture: Quick raw captures, unstructured thoughts, anything that doesn't fit above

${titleSection}Content:
---
${body.slice(0, 3000)}${body.length > 3000 ? '\n...[truncated]' : ''}
---

Respond with a JSON object only (no markdown, no explanation outside the JSON):
{
  "type": "<one of the types above>",
  "confidence": <float 0.0-1.0>,
  "template": "<template name matching the type, or null>",
  "suggested_tags": ["<3-8 relevant topic tags>"],
  "reasoning": "<one sentence>"
}`;
}

function parseResponse(text: string): LlmClassifyResponse {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in classifier response');
  }
  const raw = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  const type = KNOWN_TYPES.includes(raw['type'] as KnownType)
    ? (raw['type'] as KnownType)
    : FALLBACK_TYPE;
  const confidence =
    typeof raw['confidence'] === 'number' ? Math.min(1, Math.max(0, raw['confidence'])) : 0;
  const template =
    typeof raw['template'] === 'string' && raw['template'].length > 0 ? raw['template'] : null;
  const suggestedTags = Array.isArray(raw['suggested_tags'])
    ? (raw['suggested_tags'] as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 8)
    : [];

  return { type, confidence, template, suggested_tags: suggestedTags };
}

export class CortexClassifier {
  private readonly confidenceThreshold: number;

  constructor(options?: { confidenceThreshold?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  async classify(body: string, title?: string): Promise<ClassificationResult> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.warn('[CortexClassifier] ANTHROPIC_API_KEY not set — falling back to capture');
      return { type: FALLBACK_TYPE, confidence: 0, template: null, suggestedTags: [] };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const prompt = buildPrompt(body, title);

    let parsed: LlmClassifyResponse;
    try {
      const response = await trackInference(
        { provider: 'claude', model: MODEL, operation: OPERATION, domain: 'cerebrum' },
        () =>
          withRateLimitRetry(
            () =>
              client.messages.create({
                model: MODEL,
                max_tokens: 256,
                temperature: 0,
                messages: [{ role: 'user', content: prompt }],
              }),
            OPERATION,
            { logger, logPrefix: '[CortexClassifier]' }
          )
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      parsed = parseResponse(text);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[CortexClassifier] Classification failed — falling back to capture'
      );
      return { type: FALLBACK_TYPE, confidence: 0, template: null, suggestedTags: [] };
    }

    const type = parsed.confidence >= this.confidenceThreshold ? parsed.type : FALLBACK_TYPE;
    const template = parsed.confidence >= this.confidenceThreshold ? parsed.template : null;

    return {
      type,
      confidence: parsed.confidence,
      template,
      suggestedTags: parsed.suggested_tags,
    };
  }
}
