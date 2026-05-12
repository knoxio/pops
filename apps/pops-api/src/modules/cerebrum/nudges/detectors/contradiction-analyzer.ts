/**
 * Contradiction analyzer (PRD-084 US-03, #2580).
 *
 * Pair-wise LLM analysis that returns a structured `ContradictionEvidence`
 * record — conflict summary plus a short verbatim excerpt from each side.
 * Excerpts are required by AC #6 so the user can assess a contradiction
 * without opening either source engram.
 *
 * Inference is wrapped in `trackInference` (the same middleware #2570 is
 * adding budget enforcement to) so calls are logged, priced, and budget-
 * checked once that work lands.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { getAiModel } from '../../../core/settings/service.js';

import type { ContradictionEvidence } from '../types.js';

/** Operation tag used by inference logging and budget rules. */
const OPERATION = 'cerebrum.patterns.contradiction';

/** Maximum chars sent per passage — keeps token usage predictable. */
const MAX_BODY_CHARS = 2000;

/** Maximum length of an excerpt — short enough to render inline. */
const MAX_EXCERPT_CHARS = 240;

const SYSTEM_PROMPT = `You are an impartial fact-checker comparing two passages that share a topic.

Decide whether the passages express GENUINELY CONTRADICTORY positions on the same subject. A contradiction is when one passage asserts something that directly conflicts with what the other passage asserts. Differences in scope, complementary information, or thinking that has evolved over time are NOT contradictions.

Be conservative — only flag clear, simultaneously-held conflicts.

Respond with a single JSON object and nothing else. Two shapes are valid:

When there is NO contradiction:
{"contradiction": false}

When there IS a contradiction:
{
  "contradiction": true,
  "conflict": "<one concise sentence describing the conflict>",
  "excerptA": "<short verbatim quote from Passage A, max 240 chars>",
  "excerptB": "<short verbatim quote from Passage B, max 240 chars>"
}

Excerpts MUST be verbatim substrings of the source passage. Do not paraphrase. Do not add ellipses unless the original contains them.`;

/** Async interface a pattern detector consumes to find contradictions. */
export interface ContradictionAnalyzer {
  analyze(
    engramA: string,
    bodyA: string,
    engramB: string,
    bodyB: string
  ): Promise<ContradictionEvidence | null>;
}

/** Noop analyzer — returns no contradictions. Used when LLM is unavailable. */
export class NoopContradictionAnalyzer implements ContradictionAnalyzer {
  async analyze(
    _engramA: string,
    _bodyA: string,
    _engramB: string,
    _bodyB: string
  ): Promise<ContradictionEvidence | null> {
    return null;
  }
}

const contradictionResultSchema = z.discriminatedUnion('contradiction', [
  z.object({ contradiction: z.literal(false) }),
  z.object({
    contradiction: z.literal(true),
    conflict: z.string().trim().min(1),
    excerptA: z.string().trim().min(1),
    excerptB: z.string().trim().min(1),
  }),
]);

type LlmContradictionResponse = z.infer<typeof contradictionResultSchema>;

function getModel(): string {
  return getAiModel('ai.modelOverrides.patternContradiction', 'claude-haiku-4-20250514');
}

function truncate(body: string, max = MAX_BODY_CHARS): string {
  if (body.length <= max) return body;
  return body.slice(0, max) + '...';
}

/**
 * Hard-cut an excerpt at `MAX_EXCERPT_CHARS`.
 *
 * Excerpts are presented to the user as verbatim quotes from a source
 * engram; appending any sentinel character (e.g. an ellipsis) would
 * silently mutate the quoted text. We instead truncate cleanly — callers
 * that need to indicate truncation can compare lengths against
 * `MAX_EXCERPT_CHARS`.
 */
function clipExcerpt(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_EXCERPT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_EXCERPT_CHARS);
}

/**
 * Extract the first JSON object embedded in a string and validate it
 * against `contradictionResultSchema`. Returns null on any failure —
 * unparseable substring, JSON syntax error, or schema mismatch.
 */
function extractJson(raw: string): LlmContradictionResponse | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
  const result = contradictionResultSchema.safeParse(parsedJson);
  return result.success ? result.data : null;
}

export function parseAnalyzerResponse(raw: string): {
  conflict: string;
  excerptA: string;
  excerptB: string;
} | null {
  const parsed = extractJson(raw);
  if (!parsed || parsed.contradiction !== true) return null;
  return {
    conflict: parsed.conflict,
    excerptA: clipExcerpt(parsed.excerptA),
    excerptB: clipExcerpt(parsed.excerptB),
  };
}

/** LLM-backed contradiction analyzer that returns excerpts. */
export class LlmContradictionAnalyzer implements ContradictionAnalyzer {
  async analyze(
    engramA: string,
    bodyA: string,
    engramB: string,
    bodyB: string
  ): Promise<ContradictionEvidence | null> {
    const apiKey = getEnv('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.warn('[ContradictionAnalyzer] ANTHROPIC_API_KEY not set — skipping');
      return null;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = getModel();
    const userMessage =
      `Passage A (engram ${engramA}):\n${truncate(bodyA)}\n\n` +
      `Passage B (engram ${engramB}):\n${truncate(bodyB)}`;

    const response = await trackInference(
      { provider: 'claude', model, operation: OPERATION, domain: 'cerebrum' },
      () =>
        withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 500,
              temperature: 0,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMessage }],
            }),
          OPERATION,
          { logger, logPrefix: '[ContradictionAnalyzer]' }
        )
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = parseAnalyzerResponse(text);
    if (!parsed) return null;

    return {
      engramA,
      engramB,
      excerptA: parsed.excerptA,
      excerptB: parsed.excerptB,
      conflict: parsed.conflict,
    };
  }
}
