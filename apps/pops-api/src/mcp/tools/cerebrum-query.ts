/**
 * cerebrum.query — natural language Q&A over the Cerebrum knowledge base.
 *
 * Delegates to QueryService.ask() for one-shot, stateless answers with citations.
 * Limits retrieval to top-3 results for low MCP latency.
 */
import { QueryService } from '../../modules/cerebrum/query/query-service.js';
import { getSettingValue } from '../../modules/core/settings/service.js';
import { mapServiceError, mcpError, mcpSuccess } from '../errors.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { QueryDomain } from '../../modules/cerebrum/query/types.js';

function getMcpQueryMaxSources(): number {
  return getSettingValue('cerebrum.mcp.queryMaxSources', 3);
}

const VALID_DOMAINS = new Set<string>(['engrams', 'transactions', 'media', 'inventory']);

interface QueryArgs {
  question: string;
  scopes?: string[];
}

function parseArgs(raw: Record<string, unknown>): QueryArgs {
  const question = typeof raw['question'] === 'string' ? raw['question'] : '';
  const scopes = Array.isArray(raw['scopes'])
    ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  return { question, scopes };
}

export async function handleCerebrumQuery(raw: Record<string, unknown>): Promise<CallToolResult> {
  const args = parseArgs(raw);

  if (!args.question.trim()) {
    return mcpError('question is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const svc = new QueryService();

    const domains = Array.isArray(raw['domains'])
      ? (raw['domains'] as unknown[]).filter(
          (d): d is QueryDomain => typeof d === 'string' && VALID_DOMAINS.has(d)
        )
      : undefined;

    const result = await svc.ask({
      question: args.question,
      scopes: args.scopes,
      maxSources: getMcpQueryMaxSources(),
      domains,
    });

    return mcpSuccess({
      answer: result.answer,
      citations: result.sources.map((s) => ({
        id: s.id,
        title: s.title,
        relevance: s.relevance,
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.query tool input. */
export const cerebrumQuerySchema = {
  type: 'object' as const,
  properties: {
    question: {
      type: 'string' as const,
      description: 'Natural language question to ask about the knowledge base',
    },
    scopes: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description:
        'Optional scope filters to narrow the search (e.g. ["work.projects"]). Secret scopes excluded unless explicitly included.',
    },
  },
  required: ['question'] as const,
};
