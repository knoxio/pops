import { Button, DateInput } from '@pops/ui';

type DateRangeFilterProps = {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClear: () => void;
};

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onClear,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium">Date Range:</span>
      <DateInput
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        size="sm"
        aria-label="Start date"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <DateInput
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        size="sm"
        aria-label="End date"
      />
      {(startDate || endDate) && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
