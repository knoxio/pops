/**
 * PRD-135 — provenance pane.
 *
 * Dispatches to a per-kind body and renders the cost / extractor-version
 * footer. The bodies in v1 cover the always-on read surfaces — sandboxed
 * iframe for `url-web`, video + collapsible caption for `url-instagram`,
 * pre + copy for `text`, full-size `<img>` for `screenshot`. Image
 * zoom-on-click, the IG keyframe gallery, the STT transcript, and the
 * raw vision LLM output that the PRD calls out are deferred — they
 * depend on richer meta-JSON shapes than what handlers ship today.
 *
 * The pane is wrapped in an `ErrorBoundary` by the caller so a malformed
 * `extracted_json` doesn't take down the editor or decision panes.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { InspectorSourceView } from '@pops/app-food-db';

interface Props {
  source: InspectorSourceView;
}

export function ProvenancePane({ source }: Props): ReactElement {
  return (
    <section className="space-y-4" data-testid="inspector-provenance">
      <ProvenanceBody source={source} />
      <ProvenanceFooter source={source} />
    </section>
  );
}

function ProvenanceBody({ source }: Props): ReactElement {
  switch (source.kind) {
    case 'url-web':
      return <ProvenanceUrlWeb source={source} />;
    case 'url-instagram':
      return <ProvenanceUrlInstagram source={source} />;
    case 'text':
      return <ProvenanceText source={source} />;
    case 'screenshot':
      return <ProvenanceScreenshot source={source} />;
  }
}

function ProvenanceUrlWeb({ source }: Props): ReactElement {
  const { t } = useTranslation('food');
  if (source.url === null) {
    return <p className="text-sm text-muted-foreground">{t('inbox.inspector.provenance.noUrl')}</p>;
  }
  return (
    <div className="space-y-3">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="block break-all text-sm text-primary underline"
        data-testid="inspector-provenance-url"
      >
        {source.url}
      </a>
      <iframe
        src={source.url}
        title={t('inbox.inspector.provenance.iframeTitle')}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        className="h-96 w-full rounded border bg-muted"
        data-testid="inspector-provenance-iframe"
      />
    </div>
  );
}

function ProvenanceUrlInstagram({ source }: Props): ReactElement {
  const { t } = useTranslation('food');
  const videoSrc = `/food-api/ingest/source/${source.id}/video`;
  return (
    <div className="space-y-3">
      {source.url !== null && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block break-all text-sm text-primary underline"
        >
          {source.url}
        </a>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption --
         IG reels we save have no native caption track and an empty <track>
         element is worse than none (assistive tech may announce missing
         captions exist). Real captions would come from PRD-130's STT
         transcript — that pipeline is in flight; once stable we can wire
         a generated VTT here and drop the suppression (Copilot R1). */}
      <video
        controls
        preload="metadata"
        src={videoSrc}
        className="w-full rounded border bg-black"
        data-testid="inspector-provenance-video"
      >
        {t('inbox.inspector.provenance.videoUnsupported')}
      </video>
      {source.caption !== null && source.caption.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {t('inbox.inspector.provenance.caption')}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-sm">{source.caption}</pre>
        </details>
      )}
    </div>
  );
}

function ProvenanceText({ source }: Props): ReactElement {
  const { t } = useTranslation('food');
  const body = source.caption ?? '';
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-xs text-muted-foreground underline"
        onClick={() => {
          void navigator.clipboard?.writeText(body);
        }}
        data-testid="inspector-provenance-text-copy"
      >
        {t('inbox.inspector.provenance.copy')}
      </button>
      <pre
        className="max-h-96 overflow-auto whitespace-pre-wrap rounded border bg-muted p-3 text-sm"
        data-testid="inspector-provenance-text"
      >
        {body}
      </pre>
    </div>
  );
}

function ProvenanceScreenshot({ source }: Props): ReactElement {
  const { t } = useTranslation('food');
  const src = `/food-api/ingest/source/${source.id}/screenshot`;
  return (
    <div>
      <img
        src={src}
        alt={t('inbox.inspector.provenance.screenshotAlt')}
        className="max-w-full rounded border"
        data-testid="inspector-provenance-screenshot"
      />
    </div>
  );
}

function ProvenanceFooter({ source }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <footer className="border-t pt-2 text-xs text-muted-foreground">
      <p data-testid="inspector-provenance-cost">
        {t('inbox.inspector.provenance.cost', {
          usd: source.totalCostUsd.toFixed(4),
        })}
      </p>
      <p data-testid="inspector-provenance-version">
        {t('inbox.inspector.provenance.extractorVersion', {
          version: source.extractorVersion,
        })}
      </p>
    </footer>
  );
}
