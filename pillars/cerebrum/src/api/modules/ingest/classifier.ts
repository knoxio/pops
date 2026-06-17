/**
 * CortexClassifier — LLM-based content-type classification (PRD-081 US-04).
 *
 * Lifted from `apps/pops-api/src/modules/cerebrum/ingest/classifier.ts`. The
 * LLM call is delegated to an injected {@link IngestLlm} port (so tests run
 * offline). The confidence threshold is a hardcoded constant — the pillar has
 * no settings service to override it. Falls back to `capture` when the model
 * is unavailable or confidence is below threshold.
 */
import { type IngestLlm } from './llm.js';

import type { ClassificationResult } from './types.js';

const OPERATION = 'cerebrum.classify';
const FALLBACK_TYPE = 'capture';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const MAX_TOKENS = 256;

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
  suggestedTags: string[];
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

  return { type, confidence, template, suggestedTags };
}

export class CortexClassifier {
  private readonly llm: IngestLlm;
  private readonly confidenceThreshold: number;

  constructor(llm: IngestLlm, options?: { confidenceThreshold?: number }) {
    this.llm = llm;
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  async classify(body: string, title?: string): Promise<ClassificationResult> {
    const text = await this.llm.complete({
      operation: OPERATION,
      model: this.llm.modelFor('classifier'),
      prompt: buildPrompt(body, title),
      maxTokens: MAX_TOKENS,
    });

    if (text === null) {
      return { type: FALLBACK_TYPE, confidence: 0, template: null, suggestedTags: [] };
    }

    let parsed: LlmClassifyResponse;
    try {
      parsed = parseResponse(text);
    } catch (err) {
      console.warn(
        `[CortexClassifier] parse failed — falling back to capture: ${err instanceof Error ? err.message : String(err)}`
      );
      return { type: FALLBACK_TYPE, confidence: 0, template: null, suggestedTags: [] };
    }

    const passed = parsed.confidence >= this.confidenceThreshold;
    return {
      type: passed ? parsed.type : FALLBACK_TYPE,
      confidence: parsed.confidence,
      template: passed ? parsed.template : null,
      suggestedTags: parsed.suggestedTags,
    };
  }
}
