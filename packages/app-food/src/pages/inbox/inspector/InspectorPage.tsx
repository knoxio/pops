/**
 * PRD-135 — `/food/inbox/:sourceId` per-draft inspector.
 *
 * Three-pane layout (provenance / editor / decision) for an ingest source
 * + its draft. Replaces PRD-134's stub route. Provenance pane is wrapped
 * in an error boundary so a malformed `extracted_json` doesn't tank the
 * editor + decision panes.
 *
 * Layout: tailwind `lg:` breakpoint switches between a single stacked
 * column (decision first so Approve is above the fold on mobile) and the
 * three-pane horizontal grid (25/45/30). Resizable pane widths + the
 * `localStorage` persistence the PRD spec describes are deferred — the
 * Gaps section on the PR tracks that follow-up.
 */
import { Component, type ReactElement, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { DecisionPane } from './DecisionPane.js';
import { EditorPane } from './EditorPane.js';
import { ProvenancePane } from './ProvenancePane.js';
import { useInspector } from './useInspector.js';

import type { InspectorProposedSlugRow, InspectorReviewView } from './inspector-wire-types.js';

export function InspectorPage(): ReactElement {
  const { t } = useTranslation('food');
  const params = useParams();
  const sourceId = parseSourceId(params.sourceId);
  if (sourceId === null) return <NotFound />;
  return <InspectorBody sourceId={sourceId} t={t} />;
}

function parseSourceId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

interface BodyProps {
  sourceId: number;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function InspectorBody({ sourceId, t }: BodyProps): ReactElement {
  const inspector = useInspector({ sourceId });
  const [pendingCursor, setPendingCursor] = useState<
    { line: number; col: number; nonce: number } | undefined
  >(undefined);
  // Monotonic counter — `Date.now()` can collide on back-to-back clicks
  // (especially in tests with fake timers); a ref-backed integer always
  // changes identity so `usePendingCursor` re-runs (Copilot R1). Lives
  // before the early-return guards to honour the rules of hooks.
  const nonceRef = useRef(0);

  if (inspector.isLoading) return <LoadingState t={t} />;
  if (inspector.isError || inspector.data === undefined) {
    return <ErrorState message={inspector.error?.message ?? ''} t={t} />;
  }
  if (!inspector.data.ok) return <NotFound />;

  const review = inspector.data.review;
  const handlePickSlug = (row: InspectorProposedSlugRow): void => {
    nonceRef.current += 1;
    setPendingCursor({
      line: row.fromLoc.startLine,
      col: row.fromLoc.startCol,
      nonce: nonceRef.current,
    });
  };

  return (
    <div className="space-y-4" data-testid="inspector-page">
      <Breadcrumb review={review} t={t} />
      <InspectorLayout
        provenance={
          <ProvenanceErrorBoundary t={t}>
            <ProvenancePane source={review.source} />
          </ProvenanceErrorBoundary>
        }
        editor={
          review.draft === null ? (
            <NoDraft t={t} />
          ) : (
            <EditorPane
              draft={review.draft}
              onSaved={() => void inspector.invalidate()}
              pendingCursor={pendingCursor}
            />
          )
        }
        decision={
          <DecisionPane
            review={review}
            onMutated={() => void inspector.invalidate()}
            onPickSlug={handlePickSlug}
          />
        }
      />
    </div>
  );
}

function InspectorLayout({
  provenance,
  editor,
  decision,
}: {
  provenance: ReactNode;
  editor: ReactNode;
  decision: ReactNode;
}): ReactElement {
  // PRD-135 §Layout — `lg:` brings the three-pane horizontal split (25/45/30).
  // On narrow screens the decision pane comes first so Approve is above the
  // fold (vertical stack `flex-col-reverse`-style via explicit ordering).
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_1.8fr_1.2fr]">
      <div className="order-3 lg:order-1" data-testid="inspector-pane-provenance">
        {provenance}
      </div>
      <div className="order-2" data-testid="inspector-pane-editor">
        {editor}
      </div>
      <div className="order-1 lg:order-3" data-testid="inspector-pane-decision">
        {decision}
      </div>
    </div>
  );
}

function Breadcrumb({
  review,
  t,
}: {
  review: InspectorReviewView;
  t: (k: string, opts?: Record<string, unknown>) => string;
}): ReactElement {
  const title = review.draft?.title ?? `#${review.source.id}`;
  return (
    <nav className="flex items-center gap-2 text-sm" data-testid="inspector-breadcrumb">
      <Link to="/food/inbox" className="text-primary underline">
        {t('inbox.title')}
      </Link>
      <span className="text-muted-foreground">/</span>
      <span>{title}</span>
      <Link
        to="/food/inbox"
        className="ml-auto text-xs text-muted-foreground"
        data-testid="inspector-close"
      >
        {t('inbox.inspector.close')}
      </Link>
    </nav>
  );
}

function LoadingState({ t }: { t: (k: string) => string }): ReactElement {
  return <p className="text-sm text-muted-foreground">{t('inbox.inspector.loading')}</p>;
}

function ErrorState({
  message,
  t,
}: {
  message: string;
  t: (k: string, opts?: Record<string, unknown>) => string;
}): ReactElement {
  return (
    <p className="text-sm text-destructive" data-testid="inspector-error">
      {t('inbox.inspector.error', { message })}
    </p>
  );
}

function NotFound(): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-2" data-testid="inspector-not-found">
      <p className="text-sm">{t('inbox.inspector.notFound')}</p>
      <Link to="/food/inbox" className="text-sm text-primary underline">
        {t('inbox.inspector.notFoundLink')}
      </Link>
    </div>
  );
}

function NoDraft({ t }: { t: (k: string) => string }): ReactElement {
  return (
    <div
      className="rounded-md border bg-muted p-4 text-sm text-muted-foreground"
      data-testid="inspector-no-draft"
    >
      {t('inbox.inspector.noDraft')}
    </div>
  );
}

class ProvenanceErrorBoundary extends Component<
  { children: ReactNode; t: (k: string) => string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <p className="text-sm text-destructive" data-testid="inspector-provenance-error-boundary">
          {this.props.t('inbox.inspector.provenance.crashFallback')}
        </p>
      );
    }
    return this.props.children;
  }
}
