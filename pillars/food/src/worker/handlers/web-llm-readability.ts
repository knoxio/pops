/**
 * Readability extraction (`pillars/food/docs/prds/web-llm-fallback`).
 *
 * Wraps Mozilla Readability in a JSDOM container, returns the cleaned
 * article body or null when the page doesn't have enough content to be
 * worth handing to the LLM. Pure: caller owns the HTML; this module
 * never fetches.
 */
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

import { WEB_LLM_MAX_INPUT_CHARS, WEB_LLM_MIN_READABLE_CHARS } from '../prompts/web-llm.js';

export interface ReadableArticle {
  title: string;
  textContent: string;
  textLength: number;
  truncated: boolean;
}

/**
 * Returns a readable article extracted from `html` rooted at `baseUrl`,
 * or null when Readability finds no article body or the body is shorter
 * than `WEB_LLM_MIN_READABLE_CHARS`.
 *
 * Extractions past `WEB_LLM_MAX_INPUT_CHARS` are truncated so the
 * downstream Claude prompt stays under a sensible token budget — the
 * meta-JSON `truncated` flag surfaces this to the review queue.
 */
export function extractReadable(html: string, baseUrl: string): ReadableArticle | null {
  const dom = new JSDOM(html, { url: baseUrl });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();
  if (parsed == null) return null;
  const text = (parsed.textContent ?? '').trim();
  if (text.length < WEB_LLM_MIN_READABLE_CHARS) return null;
  const truncated = text.length > WEB_LLM_MAX_INPUT_CHARS;
  const sliced = truncated ? text.slice(0, WEB_LLM_MAX_INPUT_CHARS) : text;
  const title = parsed.title?.trim() ?? '';
  return {
    title,
    textContent: sliced,
    textLength: text.length,
    truncated,
  };
}
