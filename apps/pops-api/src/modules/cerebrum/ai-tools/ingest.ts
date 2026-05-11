/**
 * cerebrum.ingest — ingest content into the engram knowledge base.
 *
 * Delegates to IngestService. JSON detection and metadata lifting live in
 * `ingest-json.ts`; this file handles arg parsing, tag merging, and the
 * MCP-side request/response envelope.
 */
import { IngestService } from '../ingest/pipeline.js';
import { handleJsonBody } from './ingest-json.js';
import { mapServiceError, toolError, toolSuccess } from './result.js';

import type { AiToolResult } from '@pops/types';

interface IngestArgs {
  body: string;
  title?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
}

/**
 * Combine caller-supplied tags with tags lifted out of a JSON body. Both
 * sources contribute; duplicates are stripped while preserving the order in
 * which tags first appeared.
 */
function mergeTags(
  callerTags: string[] | undefined,
  jsonTags: string[] | null
): string[] | undefined {
  if (!callerTags && !jsonTags) return undefined;
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...(callerTags ?? []), ...(jsonTags ?? [])]) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    merged.push(tag);
  }
  return merged.length > 0 ? merged : undefined;
}

/**
 * Treat blank or whitespace-only string args as if the caller had omitted
 * them. Without this, `title: ''` would suppress the JSON-derived title via
 * `args.title ?? json.derivedTitle` because `??` does not fall through for
 * empty strings.
 */
function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out.length > 0 ? out : undefined;
}

function parseArgs(raw: Record<string, unknown>): IngestArgs {
  const body = typeof raw['body'] === 'string' ? raw['body'] : '';
  return {
    body,
    title: optionalTrimmedString(raw['title']),
    type: optionalTrimmedString(raw['type']),
    scopes: optionalStringArray(raw['scopes']),
    tags: optionalStringArray(raw['tags']),
  };
}

export async function handleCerebrumIngest(raw: Record<string, unknown>): Promise<AiToolResult> {
  const args = parseArgs(raw);

  if (!args.body.trim()) {
    return toolError('body is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const json = handleJsonBody(args.body);
    const title = args.title ?? json.derivedTitle ?? undefined;
    const type = args.type ?? json.derivedType ?? undefined;
    const scopes = args.scopes ?? json.derivedScopes ?? undefined;
    const tags = mergeTags(args.tags, json.derivedTags);

    const svc = new IngestService();
    const result = await svc.submit({
      body: json.body,
      title,
      type,
      scopes,
      tags,
      source: 'agent',
      ...(Object.keys(json.customFields).length > 0 ? { customFields: json.customFields } : {}),
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

// Re-export for tests that exercise the JSON detector directly.
export { handleJsonBody } from './ingest-json.js';
