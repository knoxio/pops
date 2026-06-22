/**
 * Injectable runtime seams for the corrections AI cluster: the Claude text
 * completer and the rejection-feedback store. Both default to real
 * implementations (Anthropic via env key; finance's LOCAL settings store
 * in-process, best-effort) and are swappable in tests so no test hits the
 * network.
 *
 * Mirrors the finance AI-categorizer's env-based key + the monolith's
 * best-effort feedback persistence (try/catch, degrade gracefully when the
 * settings write fails).
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';
import { getBulk, setBulk } from '@pops/pillar-settings/service';

import { type FinanceDb } from '../../../db/index.js';
import { ANTHROPIC_PROVIDER, FINANCE_DOMAIN, financeTelemetryDeps } from '../ai-telemetry-deps.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface ClaudeRequest {
  prompt: string;
  maxTokens: number;
  operation: string;
}

/** Returns the model's text, or null on no-key / API failure / empty content. */
export type ClaudeCompleter = (req: ClaudeRequest) => Promise<string | null>;

function resolveApiKey(): string {
  return process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'] ?? '';
}

function resolveModel(): string {
  return process.env['FINANCE_CORRECTIONS_AI_MODEL'] ?? DEFAULT_MODEL;
}

const defaultCompleter: ClaudeCompleter = async (req) => {
  const apiKey = resolveApiKey();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const model = resolveModel();
  try {
    const response = await callWithLogging(
      {
        provider: ANTHROPIC_PROVIDER,
        model,
        operation: req.operation,
        domain: FINANCE_DOMAIN,
        call: async () => {
          const created = await client.messages.create({
            model,
            max_tokens: req.maxTokens,
            messages: [{ role: 'user', content: req.prompt }],
          });
          return {
            response: created,
            usage: {
              inputTokens: created.usage.input_tokens,
              outputTokens: created.usage.output_tokens,
            },
          };
        },
      },
      financeTelemetryDeps()
    );
    const block = response.content[0];
    return block?.type === 'text' ? block.text : null;
  } catch {
    return null;
  }
};

let completer: ClaudeCompleter = defaultCompleter;

export function getClaudeCompleter(): ClaudeCompleter {
  return completer;
}

/** Test seam: swap the completer; pass null to restore the Anthropic default. */
export function __setClaudeCompleterForTests(impl: ClaudeCompleter | null): void {
  completer = impl ?? defaultCompleter;
}

/**
 * Persistence for rejection feedback (dynamic `corrections.changeSetRejections:*`
 * keys). The default reads/writes finance's LOCAL settings store in-process via
 * the shared free-form bulk paths (these accept undeclared/dynamic keys); both
 * legs are best-effort — a failed read/write never throws into the AI flow.
 */
export interface FeedbackStore {
  load(db: FinanceDb, key: string): Promise<string | null>;
  persist(db: FinanceDb, key: string, value: string): Promise<void>;
}

const defaultFeedbackStore: FeedbackStore = {
  load(db, key) {
    try {
      return Promise.resolve(getBulk(db, [key])[key] ?? null);
    } catch {
      return Promise.resolve(null);
    }
  },
  persist(db, key, value) {
    try {
      setBulk(db, [{ key, value }]);
    } catch {
      // best-effort: the learning loop degrades silently when the write fails.
    }
    return Promise.resolve();
  },
};

let feedbackStore: FeedbackStore = defaultFeedbackStore;

export function getFeedbackStore(): FeedbackStore {
  return feedbackStore;
}

/** Test seam: swap the feedback store; pass null to restore the SDK-backed default. */
export function __setFeedbackStoreForTests(impl: FeedbackStore | null): void {
  feedbackStore = impl ?? defaultFeedbackStore;
}
