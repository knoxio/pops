import { LayoutGrid, LayoutList, Package } from 'lucide-react';

import { ViewToggleGroup } from '@pops/ui';

import { formatCurrency } from '../../lib/utils';

import type { ViewMode } from './useItemsPageModel';

const VIEW_OPTIONS = [
  { value: 'table' as const, label: 'Table view', icon: <LayoutList className="h-4 w-4" /> },
  { value: 'grid' as const, label: 'Grid view', icon: <LayoutGrid className="h-4 w-4" /> },
];

interface SummaryAndViewProps {
  totalCount: number;
  totalReplacementValue: number;
  totalResaleValue: number;
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  storageKey: string;
}

export function SummaryAndView({
  totalCount,
  totalReplacementValue,
  totalResaleValue,
  viewMode,
  onViewChange,
  storageKey,
}: SummaryAndViewProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-full bg-app-accent/10 px-3 py-1.5">
        <Package className="h-4 w-4 text-app-accent" />
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
          {totalReplacementValue > 0 && (
            <span> — {formatCurrency(totalReplacementValue)} replacement</span>
          )}
          {totalResaleValue > 0 && <span> — {formatCurrency(totalResaleValue)} resale</span>}
        </p>
      </div>
      <ViewToggleGroup
        options={VIEW_OPTIONS}
        value={viewMode}
        onChange={onViewChange}
        storageKey={storageKey}
        className="ml-auto"
      />
    </div>
  );
}
