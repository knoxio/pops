/**
 * CitationLink — renders an engram ID as a clickable link to the engram detail view.
 *
 * Used inside assistant messages to make cited engram IDs navigable.
 */
import { Link } from 'react-router';

export interface CitationLinkProps {
  /** The engram ID (e.g. "eng_20260427_1200_some-slug"). */
  engramId: string;
}

export function CitationLink({ engramId }: CitationLinkProps) {
  return (
    <Link
      to={`/cerebrum/${engramId}`}
      className="inline-flex items-center gap-1 rounded-sm bg-app-accent/10 px-1.5 py-0.5 text-xs font-medium text-app-accent hover:bg-app-accent/20 transition-colors"
    >
      <span aria-hidden>📎</span>
      <span>{engramId}</span>
    </Link>
  );
}
