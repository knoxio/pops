import { Button } from '@pops/ui';

import { PAGE_SIZE } from '../useRulesBrowserModel';

type RulesPaginationProps = {
  total: number;
  offset: number;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function RulesPagination({
  total,
  offset,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: RulesPaginationProps) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} rules
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={onPrevious}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
