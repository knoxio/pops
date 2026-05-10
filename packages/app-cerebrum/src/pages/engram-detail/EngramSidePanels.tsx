/**
 * Detail-page sidebars: metadata + connections.
 *
 * Connections are rendered from the result of
 * `cerebrum.engrams.list({ ids: links })` so we don't need a dedicated
 * "list connected" procedure on the server.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge } from '@pops/ui';

import type { Engram, EngramStatus } from '../../engrams/types';

export function TrustBadge({ status }: { status: EngramStatus }) {
  const { t } = useTranslation('cerebrum');
  if (status === 'archived') {
    return <Badge variant="secondary">{t('engrams.detail.trust.archived')}</Badge>;
  }
  if (status === 'consolidated' || status === 'active') {
    return <Badge variant="default">{t('engrams.detail.trust.verified')}</Badge>;
  }
  return <Badge variant="outline">{t('engrams.detail.trust.draft')}</Badge>;
}

export function MetadataPanel({ engram }: { engram: Engram }) {
  const { t } = useTranslation('cerebrum');
  return (
    <aside className="space-y-3 text-sm">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('engrams.detail.metadata')}
      </h3>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">id:</span>{' '}
          <span className="font-mono">{engram.id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">type:</span> {engram.type}
        </div>
        <div className="text-muted-foreground">
          {t('engrams.detail.source', { source: engram.source })}
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {engram.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
        </div>
        {engram.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {engram.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function ConnectionsPanel({ engrams }: { engrams: Engram[] }) {
  const { t } = useTranslation('cerebrum');
  return (
    <aside className="space-y-2 text-sm">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('engrams.detail.connections')}
      </h3>
      {engrams.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('engrams.detail.connectionsEmpty')}</p>
      ) : (
        <ul className="space-y-1">
          {engrams.map((engram) => (
            <li key={engram.id}>
              <Link to={`/cerebrum/engrams/${engram.id}`} className="text-sm hover:underline">
                {engram.title}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">{engram.type}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
