/**
 * ScopeInferenceService — three-tier scope assignment (PRD-081 US-06).
 *
 * Priority:
 *   1. Explicit scopes provided by the caller → returned as-is
 *   2. Rule-based matching from scope-rules.toml via ScopeRuleEngine
 *   3. LLM-based content analysis (Claude Haiku)
 *   4. Fallback scope from scope-rules.toml defaults
 *
 * Invalid inferred scopes are silently dropped; the fallback ensures at
 * least one valid scope is always returned.
 */
import Anthropic from '@anthropic-ai/sdk';

import { getEnv } from '../../../env.js';
import { withRateLimitRetry } from '../../../lib/ai-retry.js';
import { trackInference } from '../../../lib/inference-middleware.js';
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';
import { resolveScopes } from '../engrams/scope-rules.js';
import { scopeStringSchema } from '../engrams/scope-schema.js';

import type { ScopeRulesConfig } from '../engrams/scope-rules.js';
import type { ScopeInferenceResult } from './types.js';

const OPERATION = 'cerebrum.infer-scopes';

function getScopeInferenceModel(): string {
  return getSettingValue('cerebrum.scopeInference.model', 'claude-haiku-4-5-20251001');
}

interface LlmScopeResponse {
  scopes: string[];
  confidence: number;
}

function buildPrompt(body: string, type: string, tags: string[], knownScopes: string[]): string {
  const tagsSection = tags.length > 0 ? `Tags: ${tags.join(', ')}\n` : '';
  const knownScopesSection =
    knownScopes.length > 0
      ? `\nKnown scope examples (dot-notation, 2-6 segments):\n${knownScopes.slice(0, 20).join('\n')}\n`
      : '';

  return `Assign scopes to a personal knowledge management entry. Scopes use dot-notation (e.g. work.projects.karbon, personal.journal, work.learning).

Scope rules:
- Must be 2-6 segments, lowercase alphanumeric + hyphens per segment
- Segment length 1-32 chars
- ".secret." is reserved — do not assign
- Assign 1-3 scopes that best reflect the content domain
${knownScopesSection}
Content type: ${type}
${tagsSection}
Content (first 1500 chars):
---
${body.slice(0, 1500)}${body.length > 1500 ? '\n...[truncated]' : ''}
---

Respond with JSON only:
{
  "scopes": ["<scope.one>", "<scope.two>"],
  "confidence": <float 0.0-1.0>
}`;
}

function parseResponse(text: string): LlmScopeResponse {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) return { scopes: [], confidence: 0 };

  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const scopes = Array.isArray(raw['scopes'])
      ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const confidence =
      typeof raw['confidence'] === 'number' ? Math.min(1, Math.max(0, raw['confidence'])) : 0;
    return { scopes, confidence };
  } catch {
    return { scopes: [], confidence: 0 };
  }
}

/** Validate, normalise, and filter scopes; silently drop any that fail the schema. */
function filterValidScopes(scopes: string[]): string[] {
  return scopes.flatMap((s) => {
    const result = scopeStringSchema.safeParse(s);
    return result.success ? [result.data] : [];
  });
}

function dedupeScopes(scopes: string[]): string[] {
  return [...new Set(scopes)];
}

export class ScopeInferenceService {
  constructor(private readonly scopeRulesConfig: ScopeRulesConfig) {}

  async infer(input: {
    body: string;
    type: string;
    tags: string[];
    source: string;
    explicitScopes?: string[];
    knownScopes?: string[];
  }): Promise<ScopeInferenceResult> {
    // Tier 1: explicit
    if (input.explicitScopes && input.explicitScopes.length > 0) {
      const valid = filterValidScopes(dedupeScopes(input.explicitScopes));
      if (valid.length > 0) {
        return { scopes: valid, source: 'explicit', confidence: 1.0 };
      }
    }

    // Tier 2: rules
    const ruleScopes = resolveScopes(
      { source: input.source, type: input.type, tags: input.tags },
      this.scopeRulesConfig
    );
    const fallback = this.scopeRulesConfig.defaults.fallback_scope;
    const hasRuleMatch =
      ruleScopes.length > 0 && !(ruleScopes.length === 1 && ruleScopes[0] === fallback);
    if (hasRuleMatch) {
      return { scopes: dedupeScopes(ruleScopes), source: 'rules', confidence: 0.9 };
    }

    // Tier 3: LLM
    const llmResult = await this.inferViLlm(
      input.body,
      input.type,
      input.tags,
      input.knownScopes ?? []
    );
    if (llmResult.scopes.length > 0) {
      return { scopes: llmResult.scopes, source: 'llm', confidence: llmResult.confidence };
    }

    // Tier 4: fallback
    return {
      scopes: [fallback],
      source: 'fallback',
      confidence: 0,
    };
  }

  private async inferViLlm(
    body: string,
    type: string,
    tags: string[],
    knownScopes: string[]
  ): Promise<{ scopes: string[]; confidence: number }> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { scopes: [], confidence: 0 };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const prompt = buildPrompt(body, type, tags, knownScopes);
    const model = getScopeInferenceModel();

    try {
      const response = await trackInference(
        { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
        () =>
          withRateLimitRetry(
            () =>
              client.messages.create({
                model,
                max_tokens: 128,
                temperature: 0,
                messages: [{ role: 'user', content: prompt }],
              }),
            OPERATION,
            { logger, logPrefix: '[ScopeInferenceService]' }
          )
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
      const parsed = parseResponse(text);
      const valid = filterValidScopes(dedupeScopes(parsed.scopes));
      return { scopes: valid, confidence: parsed.confidence };
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[ScopeInferenceService] LLM inference failed — will use fallback'
      );
      return { scopes: [], confidence: 0 };
    }
  }
}

/** Convenience factory — builds the service from a pre-loaded config. */
export function createScopeInferenceService(config: ScopeRulesConfig): ScopeInferenceService {
  return new ScopeInferenceService(config);
}
