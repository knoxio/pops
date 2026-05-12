/**
 * ContradictionsPanel — pattern-detection contradictions with excerpts
 * (PRD-084 US-03, #2580).
 *
 * Renders the list returned by `cerebrum.nudges.contradictions`. Each row
 * shows the LLM-derived conflict summary, a short verbatim excerpt from
 * each side, and links back to the two source engrams. Minimal styling —
 * matches the neighbouring NudgesPage list.
 */
import { Link } from 'react-router';

import { trpc } from '@pops/api-client';

interface ContradictionRow {
  id: string;
  createdAt: string;
  status: string;
  priority: string;
  title: string;
  engramA: string;
  engramB: string;
  excerptA: string;
  excerptB: string;
  conflict: string;
}

function ExcerptBlock({ engramId, excerpt }: { engramId: string; excerpt: string }) {
  return (
    <div className="border border-border rounded p-2 bg-background">
      <Link
        to={`/cerebrum/engrams/${engramId}`}
        className="text-xs font-mono text-app-accent hover:underline"
      >
        {engramId}
      </Link>
      <blockquote className="text-sm text-foreground mt-1 italic before:content-['“'] after:content-['”']">
        {excerpt}
      </blockquote>
    </div>
  );
}

function ContradictionCard({ row }: { row: ContradictionRow }) {
  return (
    <div
      className="border border-border rounded-lg p-4 bg-card space-y-3"
      data-testid="contradiction-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-medium text-sm">{row.conflict}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{row.title}</p>
        </div>
        <span className="text-xs uppercase tracking-wide text-destructive font-semibold">
          {row.priority}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ExcerptBlock engramId={row.engramA} excerpt={row.excerptA} />
        <ExcerptBlock engramId={row.engramB} excerpt={row.excerptB} />
      </div>
    </div>
  );
}

export function ContradictionsPanel() {
  const { data, isLoading, isError } = trpc.cerebrum.nudges.contradictions.useQuery({
    limit: 50,
  });

  if (isLoading) {
    return (
      <section className="space-y-3" data-testid="contradictions-loading">
        <h3 className="text-sm font-semibold">Contradictions</h3>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-3" data-testid="contradictions-error">
        <h3 className="text-sm font-semibold">Contradictions</h3>
        <p className="text-xs text-destructive">Failed to load contradictions.</p>
      </section>
    );
  }

  const rows = (data?.contradictions ?? []) as ContradictionRow[];
  const total = data?.total ?? rows.length;

  return (
    <section className="space-y-3" data-testid="contradictions-panel">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Contradictions ({total})</h3>
        <span className="text-xs text-muted-foreground">
          Pairs of engrams the LLM flagged as conflicting.
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="contradictions-empty">
          No contradictions detected. Run a pattern scan to refresh.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <ContradictionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
