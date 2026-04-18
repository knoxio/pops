/**
 * Text chunking for embedding generation.
 *
 * Uses character-count approximation for token estimation (~4 chars per token).
 * Strategy is intentionally simple — Cortex may later refine to content-aware
 * chunking (split on paragraphs, headings, etc.). The chunking function is
 * exported as a standalone utility to keep it swappable.
 */
import { createHash } from 'node:crypto';

const CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 512;
const OVERLAP_TOKENS = 50;

export const MAX_CHUNK_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 2048
export const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200
export const CONTENT_PREVIEW_LENGTH = 200;

export interface TextChunk {
  index: number;
  text: string;
}

/**
 * Split text into overlapping chunks of at most MAX_CHUNK_CHARS characters.
 * Content shorter than MAX_CHUNK_CHARS is returned as a single chunk at index 0.
 */
export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= MAX_CHUNK_CHARS) {
    return [{ index: 0, text: trimmed }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + MAX_CHUNK_CHARS, trimmed.length);
    chunks.push({ index, text: trimmed.slice(start, end) });
    index++;
    if (end === trimmed.length) break;
    start = end - OVERLAP_CHARS;
  }

  return chunks;
}

/** SHA-256 hex digest of a string. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
