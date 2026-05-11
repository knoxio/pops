/**
 * cerebrum.ingest — ingest content into the engram knowledge base.
 *
 * Delegates to IngestService. Also handles structured JSON detection: when the
 * body parses as a JSON object, POPS-native fields (`title`, `type`, `scopes`,
 * `tags`) are lifted into the ingest request (unless the caller provided
 * their own) and remaining keys land in `customFields` so they end up as
 * frontmatter (PRD-081 US-02 AC #7).
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

interface JsonBodyResult {
  body: string;
  derivedTitle: string | null;
  derivedType: string | null;
  derivedScopes: string[] | null;
  derivedTags: string[] | null;
  customFields: Record<string, unknown>;
}

const TITLE_KEYS = ['title', 'name', 'subject', 'label'] as const;

/**
 * Keys that map directly onto POPS engram frontmatter and ingest request
 * params. When the structured JSON body contains them, they are lifted out
 * rather than being stuffed back into `customFields`.
 */
const NATIVE_FIELD_KEYS = new Set<string>(['title', 'type', 'scopes', 'tags']);

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

function emptyJsonResult(body: string): JsonBodyResult {
  return {
    body,
    derivedTitle: null,
    derivedType: null,
    derivedScopes: null,
    derivedTags: null,
    customFields: {},
  };
}

function pickStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length > 0 ? out : null;
}

/**
 * Pull the native engram fields out of a parsed JSON object. Caller-supplied
 * values still win at the handler level — this just surfaces what the JSON
 * itself offered.
 */
function extractNativeFields(obj: Record<string, unknown>): {
  derivedTitle: string | null;
  derivedType: string | null;
  derivedScopes: string[] | null;
  derivedTags: string[] | null;
} {
  const titleRaw = obj['title'];
  const derivedTitle =
    typeof titleRaw === 'string' && titleRaw.trim().length > 0
      ? titleRaw.trim().slice(0, 120)
      : deriveTitleFromObject(obj);
  const typeRaw = obj['type'];
  const derivedType =
    typeof typeRaw === 'string' && typeRaw.trim().length > 0 ? typeRaw.trim() : null;
  return {
    derivedTitle,
    derivedType,
    derivedScopes: pickStringArray(obj['scopes']),
    derivedTags: pickStringArray(obj['tags']),
  };
}

function extractCustomFields(obj: Record<string, unknown>): Record<string, unknown> {
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (NATIVE_FIELD_KEYS.has(key)) continue;
    customFields[key] = value;
  }
  return customFields;
}

function tryParseJson(trimmed: string): unknown | undefined {
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * Detect structured JSON and convert to Markdown. When the body is a plain
 * JSON object, POPS-native fields are lifted out and the remaining keys are
 * returned as `customFields` so they can be persisted into the engram
 * frontmatter. Arrays and non-object JSON are still rendered as a fenced
 * code block but contribute no extracted metadata.
 */
function handleJsonBody(body: string): JsonBodyResult {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return emptyJsonResult(body);
  }
  const parsed = tryParseJson(trimmed);
  if (parsed === undefined) return emptyJsonResult(body);

  const mdBody = `\`\`\`json\n${trimmed}\n\`\`\``;
  const isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  if (!isPlainObject) {
    return { ...emptyJsonResult(mdBody), body: mdBody };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    body: mdBody,
    ...extractNativeFields(obj),
    customFields: extractCustomFields(obj),
  };
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

// Exported for testing
export { handleJsonBody };
