import { BookOpen } from 'lucide-react';

import { Card, DataTable } from '@pops/ui';

import { buildRulesColumns } from '../columns';
import { PAGE_SIZE } from '../useRulesBrowserModel';

import type { Correction } from '../types';

type RulesTableProps = {
  corrections: Correction[];
  onAutoDelete: (id: string) => void;
  onDeleteClick: (id: string) => void;
};

export function RulesTable({ corrections, onAutoDelete, onDeleteClick }: RulesTableProps) {
  if (corrections.length === 0) {
    return (
      <Card className="p-12 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">No categorisation rules found.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Rules are created automatically when AI categorises transactions.
        </p>
      </Card>
    );
  }

  const columns = buildRulesColumns({ onAutoDelete, onDeleteClick });
  return <DataTable columns={columns} data={corrections} paginated defaultPageSize={PAGE_SIZE} />;
}
