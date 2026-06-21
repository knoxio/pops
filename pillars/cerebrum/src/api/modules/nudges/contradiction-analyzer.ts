/**
 * Contradiction analyzer port for the cerebrum nudges pattern detector.
 *
 * The pattern detector's contradiction pass compares two engram bodies that
 * share a topic and asks an LLM whether they hold genuinely conflicting
 * positions. That single capability is modelled as the
 * {@link ContradictionAnalyzer} port so the detector runs against a real
 * Anthropic client in production and a canned fake in tests (tests MUST NOT
 * reach a real API).
 *
 * Pillar deltas (parity with the ingest / workers slices): the model is a
 * hardcoded haiku constant with an optional
 * `CEREBRUM_PATTERN_CONTRADICTION_MODEL` env override; there is no settings
 * service; usage/cost is reported to the ai pillar via `@pops/ai-telemetry`
 * (`callWithLogging`, fire-and-forget) and the 429 backoff
 * ({@link withRateLimitRetry}) is retained. A missing `ANTHROPIC_API_KEY`
 * yields `null` (no contradiction surfaced) rather than throwing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { callWithLogging } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { withRateLimitRetry } from '../ingest/llm.js';

import type { ContradictionEvidence } from './types.js';

export const DEFAULT_PATTERN_CONTRADICTION_MODEL = 'claude-haiku-4-5-20251001';

const OPERATION = 'cerebrum.patterns.contradiction';
const MAX_BODY_CHARS = 2000;
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

/** Capability the pattern detector's contradiction pass depends on. */
export interface ContradictionAnalyzer {
  analyze(
    engramA: string,
    bodyA: string,
    engramB: string,
    bodyB: string
  ): Promise<ContradictionEvidence | null>;
}

/** Noop analyzer — surfaces no contradictions. Used when no analyzer is wired. */
export class NoopContradictionAnalyzer implements ContradictionAnalyzer {
  analyze(): Promise<ContradictionEvidence | null> {
    return Promise.resolve(null);
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

function envModel(): string {
  const value = process.env['CEREBRUM_PATTERN_CONTRADICTION_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_PATTERN_CONTRADICTION_MODEL;
}

function truncate(body: string): string {
  return body.length <= MAX_BODY_CHARS ? body : body.slice(0, MAX_BODY_CHARS) + '...';
}

function clipExcerpt(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= MAX_EXCERPT_CHARS ? trimmed : trimmed.slice(0, MAX_EXCERPT_CHARS);
}

function extractJson(raw: string): LlmContradictionResponse | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
  const result = contradictionResultSchema.safeParse(parsedJson);
  return result.success ? result.data : null;
}

/**
 * Parse a raw analyzer response into the conflict summary + clipped excerpts,
 * or `null` when there is no contradiction or the payload fails to parse.
 */
export function parseAnalyzerResponse(
  raw: string
): { conflict: string; excerptA: string; excerptB: string } | null {
  const parsed = extractJson(raw);
  if (!parsed || parsed.contradiction !== true) return null;
  return {
    conflict: parsed.conflict,
    excerptA: clipExcerpt(parsed.excerptA),
    excerptB: clipExcerpt(parsed.excerptB),
  };
}

interface ContradictionPrompt {
  engramA: string;
  engramB: string;
  userMessage: string;
}

/**
 * Runs the contradiction prompt through the telemetry wrapper and returns the
 * model's text. Usage/cost is reported to the ai pillar (operation
 * {@link OPERATION}, domain `cerebrum`) fire-and-forget; the engram ids ride
 * along as PII-free metadata. Rethrows transport errors to the caller (which
 * degrades to `null`); the error row is scheduled inside the wrapper first.
 */
async function runContradictionLlm(
  client: Anthropic,
  prompt: ContradictionPrompt
): Promise<string> {
  const model = envModel();
  const response = await callWithLogging(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation: OPERATION,
      domain: CEREBRUM_DOMAIN,
      metadata: { engramA: prompt.engramA, engramB: prompt.engramB },
      call: async () => {
        const created = await withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: 500,
              temperature: 0,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: prompt.userMessage }],
            }),
          OPERATION
        );
        return {
          response: created,
          usage: {
            inputTokens: created.usage.input_tokens,
            outputTokens: created.usage.output_tokens,
          },
        };
      },
    },
    cerebrumTelemetryDeps()
  );
  const first = response.content[0];
  return first?.type === 'text' ? first.text : '';
}

/** Anthropic-backed contradiction analyzer that returns per-side excerpts. */
export class AnthropicContradictionAnalyzer implements ContradictionAnalyzer {
  async analyze(
    engramA: string,
    bodyA: string,
    engramB: string,
    bodyB: string
  ): Promise<ContradictionEvidence | null> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-nudges] ANTHROPIC_API_KEY not set — skipping contradiction analysis');
      return null;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const userMessage =
      `Passage A (engram ${engramA}):\n${truncate(bodyA)}\n\n` +
      `Passage B (engram ${engramB}):\n${truncate(bodyB)}`;

    let text: string;
    try {
      text = await runContradictionLlm(client, { engramA, engramB, userMessage });
    } catch (err) {
      console.warn(
        `[cerebrum-nudges] contradiction analysis failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return null;
    }

    const parsed = parseAnalyzerResponse(text);
    if (!parsed) return null;
    return { engramA, engramB, ...parsed };
  }
}
