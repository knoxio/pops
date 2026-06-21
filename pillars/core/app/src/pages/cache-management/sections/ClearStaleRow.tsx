import { Button, Input, Label } from '@pops/ui';

type ClearStaleRowProps = {
  staleDays: number;
  onStaleDaysChange: (value: number) => void;
  onClearStale: () => void;
  disabled: boolean;
};

export function ClearStaleRow({
  staleDays,
  onStaleDaysChange,
  onClearStale,
  disabled,
}: ClearStaleRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
      <div>
        <h3 className="font-medium">Clear Stale Entries</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Remove entries that have not been accessed for a given number of days.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Label
          htmlFor="stale-days"
          className="text-muted-foreground whitespace-nowrap font-normal text-sm"
        >
          Older than
        </Label>
        <Input
          id="stale-days"
          type="number"
          min={1}
          max={365}
          value={staleDays}
          onChange={(e) => {
            onStaleDaysChange(Number(e.target.value) || 30);
          }}
          className="w-16 h-8 px-2 py-1 text-sm text-center"
          aria-label="Days threshold for stale entries"
        />
        <span className="text-sm text-muted-foreground">days</span>
        <Button variant="outline" size="sm" onClick={onClearStale} disabled={disabled}>
          Clear Stale
        </Button>
      </div>
    </div>
  );
}
