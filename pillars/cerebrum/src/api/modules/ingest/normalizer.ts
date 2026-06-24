/**
 * Content normaliser — first stage of the ingestion pipeline.
 *
 * Normalisation rules (in order):
 * 1. Reject whitespace-only input
 * 2. Normalise line endings to LF
 * 3. If the body is valid JSON, convert it to a Markdown code block
 * 4. Collapse runs of 3+ blank lines to 2
 * 5. Trim each line + the whole body
 */
import { ValidationError } from '../../shared/errors.js';

/** Normalise raw input content for storage as an engram body. */
export function normaliseBody(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new ValidationError({ message: 'body must not be empty or whitespace-only' });
  }

  let body = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  body = maybeConvertJson(body);
  body = body.replace(/\n{3,}/g, '\n\n');
  body = body
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  return body.trim();
}

/**
 * If `text` is valid JSON (object or array), wrap it in a fenced code block.
 * Plain text and Markdown pass through unchanged.
 */
function maybeConvertJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
    }
  } catch {
    // Not valid JSON — leave as-is.
  }
  return text;
}
