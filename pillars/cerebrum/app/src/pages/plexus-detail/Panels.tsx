/**
 * Read-only panels for the Plexus adapter detail page — config dump,
 * last-error block, and the filter table.
 */
import { useTranslation } from 'react-i18next';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import type { PlexusAdapter, PlexusFilter } from '../../plexus/types';

export function ConfigPanel({ adapter }: { adapter: PlexusAdapter }) {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('plexus.detail.config')}
      </h3>
      {adapter.config ? (
        <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs overflow-auto">
          {JSON.stringify(adapter.config, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{t('plexus.detail.configEmpty')}</p>
      )}
    </section>
  );
}

export function ErrorPanel({ lastError }: { lastError: string | null }) {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('plexus.detail.lastError')}
      </h3>
      {lastError ? (
        <pre className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs overflow-auto">
          {lastError}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{t('plexus.detail.lastError.none')}</p>
      )}
    </section>
  );
}

export function FiltersPanel({ filters }: { filters: PlexusFilter[] }) {
  const { t } = useTranslation('cerebrum');
  if (filters.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('plexus.detail.filters')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('plexus.detail.filtersEmpty')}</p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('plexus.detail.filters')}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('plexus.detail.filters.type')}</TableHead>
            <TableHead>{t('plexus.detail.filters.field')}</TableHead>
            <TableHead>{t('plexus.detail.filters.pattern')}</TableHead>
            <TableHead>{t('plexus.detail.filters.enabled')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filters.map((f) => (
            <TableRow key={f.id} data-testid="plexus-filter-row">
              <TableCell className="text-xs">{f.filterType}</TableCell>
              <TableCell className="text-xs">{f.field}</TableCell>
              <TableCell className="text-xs font-mono">{f.pattern}</TableCell>
              <TableCell className="text-xs">
                {t(
                  f.enabled ? 'plexus.detail.filters.enabledYes' : 'plexus.detail.filters.enabledNo'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
