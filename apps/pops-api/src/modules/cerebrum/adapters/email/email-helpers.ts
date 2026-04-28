import { emailMatchesFilter, type RawEmail } from './email-parser.js';

/**
 * Email adapter helpers — HTML sanitisation, Markdown conversion, and filter matching.
 * Extracted from email-adapter.ts and email-parser.ts to respect max-lines.
 */
import type { IngestFilter } from '../types.js';

/**
 * Strip HTML to clean Markdown. Preserves links, lists, headers, emphasis.
 * Removes scripts, styles, tracking pixels, and comments.
 */
export function stripHtmlToMarkdown(html: string): string {
  let text = html;

  // Remove comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove tracking pixels (1x1 images)
  text = text.replace(/<img[^>]*(?:width|height)\s*=\s*["']?1["']?[^>]*>/gi, '');

  // Convert headers
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');

  // Convert emphasis
  text = text.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // Convert links
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert unordered list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // Remove list container tags
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // Convert line breaks and paragraphs
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Convert blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) => {
    return content
      .split('\n')
      .map((line) => `> ${line.trim()}`)
      .join('\n');
  });

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Clean up excessive whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/** Minimal Markdown to HTML for email emit. */
export function markdownToSimpleHtml(md: string): string {
  let html = md;

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Single newlines → <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Check if an email passes include/exclude filter rules.
 * Include filters are evaluated first; then exclude filters run on the result.
 */
export function passesEmailFilters(email: RawEmail, filters?: IngestFilter[]): boolean {
  if (!filters || filters.length === 0) return true;

  const includes = filters.filter((f) => f.type === 'include');
  const excludes = filters.filter((f) => f.type === 'exclude');

  if (includes.length > 0) {
    const included = includes.some((f) => emailMatchesFilter(email, f.field, f.pattern));
    if (!included) return false;
  }

  if (excludes.length > 0) {
    const excluded = excludes.some((f) => emailMatchesFilter(email, f.field, f.pattern));
    if (excluded) return false;
  }

  return true;
}
