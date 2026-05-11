/**
 * cerebrum.ingest — ingest content into the engram knowledge base.
 *
 * Delegates to {@link IngestService}. Also handles structured JSON detection:
 * when the body parses as a JSON object, the value is converted to Markdown
 * (the object rendered inside a fenced ```json``` code block) and the
 * top-level scalar keys are promoted into `customFields` so they land in the
 * engram's frontmatter. Array bodies are wrapped without metadata extraction.
 *
 * The MCP tool shape is intentionally a thin wrapper around the same
 * `IngestService.submit` procedure used by the manual UI (PRD-081 US-01) —
 * agent input and manual input share every pipeline stage (normalise →
 * classify → extract → infer → write).
 */
import { z } from 'zod';

import { IngestService } from '../ingest/pipeline.js';
import { mapServiceError, toolError, toolSuccess } from './result.js';

import type { AiToolResult } from '@pops/types';

const TITLE_KEYS = ['title', 'name', 'subject', 'label'] as const;

const RESERVED_JSON_KEYS = new Set<string>([...TITLE_KEYS, 'body', 'content', 'text']);

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
 * Promote top-level scalar fields from a JSON body into `customFields`.
 *
 * Only primitives (string, number, boolean) and arrays of primitives are
 * kept — deeply nested objects stay inside the JSON code block in the body
 * to avoid polluting frontmatter with structures that frontmatter can't
 * cleanly represent. Reserved keys (title aliases, body/content/text) are
 * skipped because they are either consumed elsewhere or duplicate the body.
 */
function extractCustomFieldsFromObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (RESERVED_JSON_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      value.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    ) {
      out[key] = value;
    }
  }
  return out;
}

export interface JsonBodyResult {
  /** Either the original body (when not JSON) or the JSON wrapped in a fenced code block. */
  body: string;
  /** Title derived from a `title`/`name`/`subject`/`label` key, or a key summary. */
  derivedTitle: string | null;
  /** Top-level scalar JSON fields, to be merged into the engram's frontmatter customFields. */
  extractedFields: Record<string, unknown>;
}

/**
 * Detect structured JSON in the body.
 *
 * For JSON objects: returns the body wrapped in a fenced ```json``` block,
 * a title derived from the object, and the object's scalar fields promoted
 * to frontmatter via `extractedFields`. For JSON arrays: wraps in a code
 * block but extracts no metadata. For non-JSON: returns the original body
 * unchanged.
 */
export function handleJsonBody(body: string): JsonBodyResult {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { body, derivedTitle: null, extractedFields: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { body, derivedTitle: null, extractedFields: {} };
  }

  const isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const mdBody = `\`\`\`json\n${trimmed}\n\`\`\``;

  if (!isPlainObject) {
    return { body: mdBody, derivedTitle: null, extractedFields: {} };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    body: mdBody,
    derivedTitle: deriveTitleFromObject(obj),
    extractedFields: extractCustomFieldsFromObject(obj),
  };
}

// Lenient string-array coercion: array inputs may include non-string entries
// (agents sometimes send mixed JSON). Drop those rather than reject the call
// — the dropped values weren't meaningful scopes/tags anyway. A non-array
// value (e.g. a stray string) falls through `.catch(undefined)` instead of
// blowing up the whole call.
const stringArrayLenient = z
  .preprocess(
    (value) =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : value,
    z.array(z.string()).optional()
  )
  .catch(undefined);

// Each field carries its own `.catch` so that an agent sending a wrongly-typed
// value (e.g. `body: 123` or `title: ["array"]`) falls back to the field-level
// default without aborting the whole parse. Object-level `.catch` is not used
// here because in Zod v4 it does not recover from individual field failures —
// see https://zod.dev/api/modifiers/catch — so it would swallow real errors
// while still failing the parse for unrelated reasons.
const optionalString = z.string().optional().catch(undefined);

const ingestArgsSchema = z.object({
  body: z.string().catch('').default(''),
  title: optionalString,
  type: optionalString,
  scopes: stringArrayLenient,
  tags: stringArrayLenient,
});

type IngestArgs = z.infer<typeof ingestArgsSchema>;

function parseIngestArgs(raw: Record<string, unknown>): IngestArgs {
  return ingestArgsSchema.parse(raw);
}

export async function handleCerebrumIngest(raw: Record<string, unknown>): Promise<AiToolResult> {
  const args = parseIngestArgs(raw);

  if (!args.body.trim()) {
    return toolError('body is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const { body: processedBody, derivedTitle, extractedFields } = handleJsonBody(args.body);
    const title = args.title ?? derivedTitle ?? undefined;
    const customFields = Object.keys(extractedFields).length > 0 ? extractedFields : undefined;

    const svc = new IngestService();
    const result = await svc.submit({
      body: processedBody,
      title,
      type: args.type,
      scopes: args.scopes,
      tags: args.tags,
      source: 'agent',
      customFields,
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

// ---------------------------------------------------------------------------
// cerebrum.quickCapture — lightweight MCP tool for agent capture (PRD-081 US-02 AC #2)
// ---------------------------------------------------------------------------

const quickCaptureArgsSchema = z.object({
  text: z.string().catch('').default(''),
});

/**
 * MCP wrapper for `IngestService.quickCapture`. Stores raw text as a
 * `type=capture` engram and enqueues an async classification job. Used by
 * agent paths (Claude Code, Moltbot) that want minimum friction; the heavy
 * pipeline (classify/extract/scope) runs asynchronously.
 */
export async function handleCerebrumQuickCapture(
  raw: Record<string, unknown>
): Promise<AiToolResult> {
  const args = quickCaptureArgsSchema.parse(raw);

  if (!args.text.trim()) {
    return toolError('text is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const svc = new IngestService();
    const result = await svc.quickCapture(args.text, 'agent');
    return toolSuccess({
      engram: {
        id: result.id,
        type: result.type,
        scopes: result.scopes,
        filePath: result.path,
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.quickCapture tool input. */
export const cerebrumQuickCaptureSchema = {
  type: 'object' as const,
  properties: {
    text: {
      type: 'string' as const,
      description:
        'Raw text to capture. Stored as type=capture; classification, entity extraction and scope inference run asynchronously after storage.',
    },
  },
  required: ['text'] as const,
};
