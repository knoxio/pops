/**
 * EngramDetailPage — `/cerebrum/engrams/:id`.
 *
 * Hosts both the read-only render and the inline edit form. Mode is
 * controlled by the view-model hook (PRD-077, PRD-078). The
 * connections panel reuses `cerebrum.engrams.list({ ids })` rather
 * than introducing a dedicated procedure.
 */
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button, PageHeader, Skeleton } from '@pops/ui';

import { useEngramDetailModel } from '../engrams/useEngramDetailModel';
import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';
import { EngramEditForm } from './engram-detail/EngramEditForm';
import { ConnectionsPanel, MetadataPanel, TrustBadge } from './engram-detail/EngramSidePanels';

type Model = ReturnType<typeof useEngramDetailModel>;

function ReadOnlyBody({ body }: { body: string }) {
  const { t } = useTranslation('cerebrum');
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
        {t('engrams.detail.body')}
      </h3>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre>
    </section>
  );
}

function DraftBanner({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  if (!model.draftRestored) return null;
  return (
    <div
      data-testid="draft-restored-banner"
      className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs flex items-center justify-between"
    >
      <span>{t('engrams.edit.draftRestored')}</span>
      <Button variant="ghost" size="sm" onClick={() => model.discardDraft()}>
        {t('engrams.edit.discardDraft')}
      </Button>
    </div>
  );
}

function HeaderRow({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  if (!model.engram) return null;
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xl font-semibold flex-1">{model.engram.title}</h2>
      <TrustBadge status={model.engram.status} />
      {!model.isEditing && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => model.beginEdit()}
          className={TOUCH_TARGET_MIN_HEIGHT}
        >
          {t('engrams.detail.edit')}
        </Button>
      )}
    </div>
  );
}

function DetailContent({ model }: { model: Model }) {
  if (!model.engram) return null;
  return (
    <div className="space-y-6">
      <DraftBanner model={model} />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_18rem] gap-6">
        <div className="space-y-4">
          <HeaderRow model={model} />
          {model.isEditing ? <EngramEditForm model={model} /> : <ReadOnlyBody body={model.body} />}
        </div>
        <div className="space-y-6">
          <MetadataPanel engram={model.engram} />
          <ConnectionsPanel engrams={model.connectedEngrams} />
        </div>
      </div>
    </div>
  );
}

function PageBody({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  if (model.isLoading) {
    return (
      <div className="space-y-2" data-testid="engram-detail-loading">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (model.notFound) {
    return <p className="text-muted-foreground">{t('engrams.detail.notFound')}</p>;
  }
  if (model.error) {
    return (
      <p className="text-destructive" data-testid="engram-detail-error">
        {model.error.message}
      </p>
    );
  }
  return <DetailContent model={model} />;
}

export function EngramDetailPage() {
  const { t } = useTranslation('cerebrum');
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const model = useEngramDetailModel({ id, t });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader
        title={t('engrams.title')}
        backHref="/cerebrum/engrams"
        breadcrumbs={[
          { label: t('engrams.title'), href: '/cerebrum/engrams' },
          { label: model.engram?.title ?? id },
        ]}
      />
      <PageBody model={model} />
    </div>
  );
}
