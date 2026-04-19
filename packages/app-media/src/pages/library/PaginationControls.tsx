import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, Select } from '@pops/ui';

import { PAGE_SIZE_OPTIONS } from './types';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function PageInfo({
  totalItems,
  page,
  totalPages,
}: {
  totalItems: number;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>
        {totalItems} {totalItems === 1 ? 'item' : 'items'}
      </span>
      <span className="text-border">|</span>
      <span>
        Page {page} of {totalPages}
      </span>
    </div>
  );
}

function PageNav({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Pick<
  PaginationControlsProps,
  'page' | 'totalPages' | 'pageSize' | 'onPageChange' | 'onPageSizeChange'
>) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(pageSize)}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        aria-label="Items per page"
        size="sm"
        options={PAGE_SIZE_OPTIONS.map((size) => ({
          value: String(size),
          label: `${size} per page`,
        }))}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PaginationControls(props: PaginationControlsProps) {
  if (props.totalItems === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <PageInfo totalItems={props.totalItems} page={props.page} totalPages={props.totalPages} />
      <PageNav {...props} />
    </div>
  );
}
