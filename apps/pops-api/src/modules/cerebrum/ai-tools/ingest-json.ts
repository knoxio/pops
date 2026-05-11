/**
 * Structured-JSON detection for `cerebrum.ingest`. When an agent submits a
 * JSON object as the body, POPS-native fields (`title`/`type`/`scopes`/
 * `tags`) are lifted into the ingest request and the remaining keys are
 * persisted as frontmatter `customFields` (PRD-081 US-02 AC #7).
 *
 * Arrays and primitive JSON are still rendered as a fenced code block but
 * contribute no derived metadata. Plain-text input round-trips unchanged.
 */

export interface JsonBodyResult {
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

const PROTOTYPE_POLLUTION_KEYS = new Set<string>(['__proto__', 'prototype', 'constructor']);

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
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out.length > 0 ? out : null;
}

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

/**
 * Copy non-native, non-prototype keys from a parsed JSON object into a
 * prototype-less bag. Untrusted MCP tool input must not be able to inject
 * `__proto__` / `constructor` payloads into the engram custom fields.
 */
function extractCustomFields(obj: Record<string, unknown>): Record<string, unknown> {
  const customFields = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (NATIVE_FIELD_KEYS.has(key)) continue;
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    customFields[key] = obj[key];
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

export function handleJsonBody(body: string): JsonBodyResult {
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
