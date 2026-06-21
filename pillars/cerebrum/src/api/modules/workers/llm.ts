/**
 * LLM-backed contradiction detector for the AuditorWorker.
 *
 * Lifts the monolith's pair-wise contradiction analyzer onto the
 * {@link ContradictionDetector} port the auditor consumes (returns the conflict
 * summary string, or null when there is no contradiction). The auditor only
 * needs the summary; the verbatim-excerpt shape the nudges detector returns is
 * not part of the worker action payload.
 *
 * Pillar deltas (parity with the ingest/ego slices): model is a hardcoded haiku
 * constant with an optional `CEREBRUM_AUDITOR_MODEL` env override; no settings
 * service; usage/cost is reported to the ai pillar via `@pops/ai-telemetry`
 * (`callWithLogging`, fire-and-forget) and the 429 backoff is retained. A
 * missing `ANTHROPIC_API_KEY` yields null (no contradiction surfaced) rather
 * than throwing. Tests inject a fake.
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

import type { ContradictionDetector } from './auditor.js';

export const DEFAULT_AUDITOR_MODEL = 'claude-haiku-4-5-20251001';

const MAX_BODY_CHARS = 2000;
const OPERATION = 'cerebrum.auditor.contradiction';

const SYSTEM_PROMPT = `You are an impartial fact-checker comparing two passages that share a topic.

Decide whether the passages express GENUINELY CONTRADICTORY positions on the same subject. A contradiction is when one passage asserts something that directly conflicts with what the other passage asserts. Differences in scope, complementary information, or thinking that has evolved over time are NOT contradictions.

Be conservative — only flag clear, simultaneously-held conflicts.

Respond with a single JSON object and nothing else. Two shapes are valid:

When there is NO contradiction:
{"contradiction": false}

When there IS a contradiction:
{
  "contradiction": true,
  "conflict": "<one concise sentence describing the conflict>"
}`;

const contradictionResultSchema = z.discriminatedUnion('contradiction', [
  z.object({ contradiction: z.literal(false) }),
  z.object({ contradiction: z.literal(true), conflict: z.string().trim().min(1) }),
]);

function envModel(): string {
  const value = process.env['CEREBRUM_AUDITOR_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_AUDITOR_MODEL;
}

function truncate(body: string): string {
  return body.length <= MAX_BODY_CHARS ? body : body.slice(0, MAX_BODY_CHARS) + '...';
}

/**
 * Extract the first JSON object embedded in a string and validate it. Returns
 * the conflict summary on a contradiction, else null (no contradiction or any
 * parse/schema failure).
 */
export function parseContradictionResponse(raw: string): string | null {
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
  if (!result.success || result.data.contradiction !== true) return null;
  return result.data.conflict;
}

/** Anthropic-backed contradiction detector. */
export class AnthropicContradictionDetector implements ContradictionDetector {
  async detectContradiction(bodyA: string, bodyB: string): Promise<string | null> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn('[cerebrum-auditor] ANTHROPIC_API_KEY not set — skipping contradiction check');
      return null;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = envModel();
    const userMessage = `Passage A:\n${truncate(bodyA)}\n\nPassage B:\n${truncate(bodyB)}`;

    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: OPERATION,
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model,
                  max_tokens: 500,
                  temperature: 0,
                  system: SYSTEM_PROMPT,
                  messages: [{ role: 'user', content: userMessage }],
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
      const text = first?.type === 'text' ? first.text : '';
      return parseContradictionResponse(text);
    } catch (err) {
      console.warn(
        `[cerebrum-auditor] contradiction check failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }
}
