/**
 * Parse and serialize engram files on disk.
 *
 * The file is the source of truth. These helpers bridge the on-disk Markdown
 * format and the validated in-memory shape; every read goes through
 * `parseEngramFile`, every write through `serializeEngram`.
 */
import matter from 'gray-matter';
import { dump as yamlDump, JSON_SCHEMA as yamlJsonSchema, load as yamlLoad } from 'js-yaml';
import { ZodError } from 'zod';

import { engramFrontmatterSchema, type EngramFrontmatter } from './schema.js';

/**
 * Use js-yaml's JSON_SCHEMA (not DEFAULT_SCHEMA) so ISO timestamps stay as
 * strings rather than being parsed into `Date` objects. Preserving the
 * original string preserves the timezone offset the user wrote.
 */
const yamlEngine = {
  parse: (input: string): object => {
    const out = yamlLoad(input, { schema: yamlJsonSchema });
    return out && typeof out === 'object' ? (out as object) : {};
  },
  stringify: (input: object): string =>
    yamlDump(input, { schema: yamlJsonSchema, lineWidth: -1, noRefs: true }),
};

const MATTER_OPTIONS = { engines: { yaml: yamlEngine }, language: 'yaml' } as const;

export class EngramParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EngramParseError';
  }
}

export interface ParsedEngram {
  frontmatter: EngramFrontmatter;
  body: string;
}

/** Parse a raw file string into validated frontmatter and a Markdown body. */
export function parseEngramFile(content: string): ParsedEngram {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content, MATTER_OPTIONS);
  } catch (err) {
    throw new EngramParseError('Failed to parse YAML frontmatter', err);
  }

  try {
    const frontmatter = engramFrontmatterSchema.parse(parsed.data);
    return { frontmatter, body: parsed.content };
  } catch (err) {
    if (err instanceof ZodError) {
      throw new EngramParseError(`Invalid engram frontmatter: ${err.message}`, err);
    }
    throw err;
  }
}

/**
 * Produce a valid engram file string. Frontmatter keys are ordered for
 * readable diffs; the body is trimmed and re-terminated with a single newline.
 */
export function serializeEngram(frontmatter: EngramFrontmatter, body: string): string {
  // Validate so callers can't write malformed files by accident.
  const valid = engramFrontmatterSchema.parse(frontmatter);
  const ordered = orderFrontmatter(valid);
  const trimmedBody = `${body.trimEnd()}\n`;
  return matter.stringify(trimmedBody, ordered, MATTER_OPTIONS);
}

const FRONTMATTER_KEY_ORDER: readonly string[] = [
  'id',
  'type',
  'scopes',
  'created',
  'modified',
  'source',
  'tags',
  'links',
  'status',
  'template',
];

function orderFrontmatter(fm: EngramFrontmatter): Record<string, unknown> {
  const source = fm as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  // Preserve template-supplied custom fields at the bottom, sorted for diff stability.
  const knownKeys = new Set<string>(FRONTMATTER_KEY_ORDER);
  const customKeys = Object.keys(source)
    .filter((k) => !knownKeys.has(k))
    .toSorted();
  for (const key of customKeys) {
    out[key] = source[key];
  }
  return out;
}

/** Extract the first H1 heading from a body, or fall back to the first non-empty line. */
export function deriveTitle(body: string): string {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1?.[1]) return h1[1].trim();
    return line;
  }
  return 'Untitled';
}

/** Count words in the body (not frontmatter). Whitespace-delimited tokens. */
export function countWords(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
