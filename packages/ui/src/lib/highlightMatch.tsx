import type { ReactNode } from 'react';

export type MatchType = 'exact' | 'prefix' | 'contains';

/**
 * Highlight the matched portion of `text` based on `query` and `matchType`.
 * Returns a React node with the matched slice wrapped in a styled `<mark>`.
 *
 * - `exact`    — highlights the full string only when it exactly equals `query`
 * - `prefix`   — highlights from the start only when `text` starts with `query`
 * - `contains` — highlights the first occurrence anywhere in the string
 */
export function highlightMatch(
  text: string,
  query: string,
  matchType: MatchType | string = 'contains'
): ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let start: number;
  if (matchType === 'exact') {
    start = lowerText === lowerQuery ? 0 : -1;
  } else if (matchType === 'prefix') {
    start = lowerText.startsWith(lowerQuery) ? 0 : -1;
  } else {
    start = lowerText.indexOf(lowerQuery);
  }

  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-warning/20 px-0.5 dark:bg-warning/30">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
