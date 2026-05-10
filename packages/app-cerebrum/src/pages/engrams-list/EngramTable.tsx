/**
 * Tabular renderer for an engram listing. Each row links to the
 * detail page for that engram.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import type { Engram } from '../../engrams/types';

function formatDateForDisplay(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function EngramRow({ engram }: { engram: Engram }) {
  return (
    <TableRow data-testid="engram-row">
      <TableCell className="font-medium">
        <Link to={`/cerebrum/engrams/${engram.id}`} className="hover:underline">
          {engram.title}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{engram.type}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {engram.scopes.slice(0, 3).join(', ')}
        {engram.scopes.length > 3 ? '…' : ''}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateForDisplay(engram.modified)}
      </TableCell>
    </TableRow>
  );
}

export function EngramTable({ engrams }: { engrams: Engram[] }) {
  const { t } = useTranslation('cerebrum');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('engrams.list.column.title')}</TableHead>
          <TableHead>{t('engrams.list.column.type')}</TableHead>
          <TableHead>{t('engrams.list.column.scopes')}</TableHead>
          <TableHead>{t('engrams.list.column.modified')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {engrams.map((engram) => (
          <EngramRow key={engram.id} engram={engram} />
        ))}
      </TableBody>
    </Table>
  );
}
