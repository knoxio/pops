/**
 * Injectable runtime seams for the corrections AI cluster: the Claude text
 * completer and the cross-pillar rejection-feedback store. Both default to
 * real implementations (Anthropic via env key; core settings via the server
 * SDK, best-effort) and are swappable in tests so no test hits the network.
 *
 * Mirrors the finance AI-categorizer's env-based key + the monolith's
 * best-effort feedback persistence (try/catch, degrade gracefully when core is
 * unavailable).
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { isOk } from '@pops/pillar-sdk/client';
import { pillar } from '@pops/pillar-sdk/server';

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
  try {
    const response = await client.messages.create({
      model: resolveModel(),
      max_tokens: req.maxTokens,
      messages: [{ role: 'user', content: req.prompt }],
    });
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
 * keys). The default reaches core settings over the REST server SDK; both legs
 * are best-effort — a missing/unavailable core never throws into the AI flow.
 */
export interface FeedbackStore {
  load(key: string): Promise<string | null>;
  persist(key: string, value: string): Promise<void>;
}

const SettingsManyResponseSchema = z.object({ settings: z.record(z.string(), z.string()) });

const defaultFeedbackStore: FeedbackStore = {
  async load(key) {
    try {
      const result = await pillar('core').callDynamic(
        'settings',
        'getMany',
        { keys: [key] },
        'query'
      );
      if (!isOk(result)) return null;
      const parsed = SettingsManyResponseSchema.safeParse(result.value);
      return parsed.success ? (parsed.data.settings[key] ?? null) : null;
    } catch {
      return null;
    }
  },
  async persist(key, value) {
    try {
      await pillar('core').callDynamic(
        'settings',
        'setMany',
        { entries: [{ key, value }] },
        'mutation'
      );
    } catch {
      // best-effort: the learning loop degrades silently when core is down.
    }
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
