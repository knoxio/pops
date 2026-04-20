import { Button, Input, Label } from '@pops/ui';

type StaleEntriesControlProps = {
  staleDays: number;
  onStaleDaysChange: (days: number) => void;
  onClearStale: () => void;
  disabled: boolean;
};

export function StaleEntriesControl({
  staleDays,
  onStaleDaysChange,
  onClearStale,
  disabled,
}: StaleEntriesControlProps) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Label htmlFor="stale-days" className="text-muted-foreground whitespace-nowrap font-normal">
          Older than
        </Label>
        <Input
          id="stale-days"
          type="number"
          min={1}
          max={365}
          value={staleDays}
          onChange={(e) => onStaleDaysChange(Number(e.target.value) || 30)}
          className="w-16 h-8 px-2 py-1 text-sm text-center"
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
      <Button variant="outline" size="sm" onClick={onClearStale} disabled={disabled}>
        Clear Stale
      </Button>
    </>
  );
}
