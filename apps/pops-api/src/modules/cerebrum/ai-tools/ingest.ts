/**
 * cerebrum.ingest — ingest content into the engram knowledge base.
 *
 * Delegates to IngestService. Also handles structured JSON detection:
 * if the body starts with `{` or `[` and parses as valid JSON, it is
 * converted to Markdown with the JSON in a fenced code block.
 */
import { IngestService } from '../ingest/pipeline.js';
import { mapServiceError, toolError, toolSuccess } from './result.js';

import type { AiToolResult } from '@pops/types';

interface IngestArgs {
  body: string;
  title?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
}

const TITLE_KEYS = ['title', 'name', 'subject', 'label'] as const;

/** Try to extract a title from a JSON object's well-known keys, falling back to a key summary. */
function deriveTitleFromObject(obj: Record<string, unknown>): string | null {
  for (const key of TITLE_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim().slice(0, 120);
    }
  }

  const keys = Object.keys(obj);
  if (keys.length > 0) {
    return `JSON: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''}`;
  }

  return null;
}

/**
 * Detect structured JSON and convert to Markdown.
 * Returns a new body and optional derived title.
 */
function handleJsonBody(body: string): { body: string; derivedTitle: string | null } {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { body, derivedTitle: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { body, derivedTitle: null };
  }

  const isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const derivedTitle = isPlainObject
    ? deriveTitleFromObject(parsed as Record<string, unknown>)
    : null;

  const mdBody = `\`\`\`json\n${trimmed}\n\`\`\``;
  return { body: mdBody, derivedTitle };
}

function parseArgs(raw: Record<string, unknown>): IngestArgs {
  const body = typeof raw['body'] === 'string' ? raw['body'] : '';
  const title = typeof raw['title'] === 'string' ? raw['title'] : undefined;
  const type = typeof raw['type'] === 'string' ? raw['type'] : undefined;
  const scopes = Array.isArray(raw['scopes'])
    ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  const tags = Array.isArray(raw['tags'])
    ? (raw['tags'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  return { body, title, type, scopes, tags };
}

export async function handleCerebrumIngest(raw: Record<string, unknown>): Promise<AiToolResult> {
  const args = parseArgs(raw);

  if (!args.body.trim()) {
    return toolError('body is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const { body: processedBody, derivedTitle } = handleJsonBody(args.body);
    const title = args.title ?? derivedTitle ?? undefined;

    const svc = new IngestService();
    const result = await svc.submit({
      body: processedBody,
      title,
      type: args.type,
      scopes: args.scopes,
      tags: args.tags,
      source: 'agent',
    });

    return toolSuccess({
      engram: {
        id: result.engram.id,
        title: result.engram.title,
        type: result.engram.type,
        scopes: result.engram.scopes,
        filePath: result.engram.filePath,
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.ingest tool input. */
export const cerebrumIngestSchema = {
  type: 'object' as const,
  properties: {
    body: {
      type: 'string' as const,
      description: 'The content body to ingest. Plain text, Markdown, or JSON.',
    },
    title: {
      type: 'string' as const,
      description: 'Optional title. Auto-derived if omitted.',
    },
    type: {
      type: 'string' as const,
      description: 'Content type (e.g. "note", "reference", "log"). Auto-classified if omitted.',
    },
    scopes: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Scopes for the engram (e.g. ["personal.finance"]). Auto-inferred if omitted.',
    },
    tags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Tags for the engram.',
    },
  },
  required: ['body'] as const,
};

// Exported for testing
export { handleJsonBody };
