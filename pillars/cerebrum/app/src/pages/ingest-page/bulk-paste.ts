/**
 * Bulk paste helpers (PRD-081 US-08).
 *
 * Splits the capture body on `---` separator lines into N engram segments,
 * skipping empty segments. The split happens client-side; each surviving
 * segment is submitted as its own quickCapture mutation.
 */

const SEPARATOR_LINE = /^\s*---\s*$/;
const PREVIEW_CHARS = 60;

export interface BulkSegment {
  index: number;
  body: string;
  preview: string;
}

export function splitOnSeparator(body: string): BulkSegment[] {
  const lines = body.split('\n');
  const segments: string[][] = [[]];
  for (const line of lines) {
    if (SEPARATOR_LINE.test(line)) {
      segments.push([]);
    } else {
      segments[segments.length - 1]?.push(line);
    }
  }
  const out: BulkSegment[] = [];
  for (const [index, segLines] of segments.entries()) {
    const text = segLines.join('\n').trim();
    if (text.length === 0) continue;
    out.push({ index, body: text, preview: previewOf(text) });
  }
  return out;
}

export function hasSeparator(body: string): boolean {
  return body.split('\n').some((line) => SEPARATOR_LINE.test(line));
}

function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_CHARS) return flat;
  return `${flat.slice(0, PREVIEW_CHARS - 1).trimEnd()}…`;
}
