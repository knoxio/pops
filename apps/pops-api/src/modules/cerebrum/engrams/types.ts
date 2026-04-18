/**
 * Public shapes returned from the engram service and tRPC layer.
 */
import type { EngramFrontmatter, EngramSource, EngramStatus } from './schema.js';

/**
 * An engram summary — all the frontmatter plus index-derived metadata (path,
 * content hash, word count). Equivalent to an `engram_index` row expanded with
 * its scopes, tags, and links.
 */
export interface Engram {
  id: string;
  type: string;
  scopes: string[];
  tags: string[];
  links: string[];
  created: string;
  modified: string;
  source: EngramSource;
  status: EngramStatus;
  template: string | null;
  title: string;
  filePath: string;
  contentHash: string;
  wordCount: number;
  customFields: Record<string, unknown>;
}

/** Project a validated frontmatter + index-derived metadata into an Engram. */
export function buildEngram(
  frontmatter: EngramFrontmatter,
  meta: {
    filePath: string;
    title: string;
    contentHash: string;
    wordCount: number;
    customFields: Record<string, unknown>;
  }
): Engram {
  return {
    id: frontmatter.id,
    type: frontmatter.type,
    scopes: [...frontmatter.scopes],
    tags: [...(frontmatter.tags ?? [])],
    links: [...(frontmatter.links ?? [])],
    created: frontmatter.created,
    modified: frontmatter.modified,
    source: frontmatter.source,
    status: frontmatter.status,
    template: frontmatter.template ?? null,
    title: meta.title,
    filePath: meta.filePath,
    contentHash: meta.contentHash,
    wordCount: meta.wordCount,
    customFields: meta.customFields,
  };
}
