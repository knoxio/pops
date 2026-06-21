/**
 * Single row inside the Aliases table (PRD-122-C).
 *
 * Switches between read mode and inline edit mode. Read mode shows the
 * alias text, target label, source chip, and the raw ISO `created_at`
 * timestamp from the server. Edit mode swaps the alias cell for an
 * input; submit fires `onUpdateAlias(id, newText)`.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, Input, TableCell, TableRow } from '@pops/ui';

import { formatTargetLabel, formatTargetSlug } from './format.js';

import type { AliasRow } from './types.js';

export interface AliasesTableRowProps {
  readonly row: AliasRow;
  readonly selected: boolean;
  readonly onToggleSelection: (id: number) => void;
  readonly onUpdateAlias: (id: number, alias: string) => void;
  readonly onDeleteAlias: (id: number) => void;
}

export function AliasesTableRow(props: AliasesTableRowProps) {
  const { row, selected, onToggleSelection, onUpdateAlias, onDeleteAlias } = props;
  const { t } = useTranslation('food');
  return (
    <TableRow data-testid={`alias-row-${row.id}`}>
      <TableCell>
        <Checkbox
          aria-label={t('data.aliases.row.selectAria', { alias: row.alias })}
          checked={selected}
          onCheckedChange={() => onToggleSelection(row.id)}
        />
      </TableCell>
      <TableCell>
        <AliasCell row={row} onUpdateAlias={onUpdateAlias} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{formatTargetLabel(row.target)}</span>
          <span className="text-muted-foreground font-mono text-xs">
            {formatTargetSlug(row.target)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <SourceChip source={row.source} />
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">{row.createdAt}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDeleteAlias(row.id)}
          aria-label={t('data.aliases.row.deleteAria', { alias: row.alias })}
        >
          {t('data.aliases.row.delete')}
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface AliasCellProps {
  readonly row: AliasRow;
  readonly onUpdateAlias: (id: number, alias: string) => void;
}

function AliasCell({ row, onUpdateAlias }: AliasCellProps) {
  const { t } = useTranslation('food');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(row.alias);
  // Cancel is tracked via a ref because the onKeyDown → blur transition
  // is synchronous and `useState` updates don't flush until the next
  // render. A ref is read in the same tick `commitEdit` runs, so Escape
  // reliably suppresses the commit (Copilot review round 2 on PR #2724).
  const cancelRef = useRef(false);

  function commitEdit(): void {
    if (cancelRef.current) {
      cancelRef.current = false;
      setEditing(false);
      return;
    }
    const next = editText.trim();
    if (next.length > 0 && next !== row.alias) onUpdateAlias(row.id, next);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.currentTarget as HTMLInputElement).blur();
            return;
          }
          if (e.key === 'Escape') {
            cancelRef.current = true;
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        aria-label={t('data.aliases.row.editAria', { alias: row.alias })}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        cancelRef.current = false;
        setEditText(row.alias);
        setEditing(true);
      }}
      className="hover:bg-muted -mx-2 rounded px-2 py-1 text-left"
      aria-label={t('data.aliases.row.editAria', { alias: row.alias })}
    >
      {row.alias}
    </button>
  );
}

const SOURCE_TONE: Record<AliasRow['source'], string> = {
  user: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  llm: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  ingest: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
};

function SourceChip({ source }: { source: AliasRow['source'] }) {
  const { t } = useTranslation('food');
  return (
    <span className={`${SOURCE_TONE[source]} rounded-full px-2 py-0.5 text-xs`}>
      {t(`data.aliases.source.${source}`)}
    </span>
  );
}
