import { Button, Label } from '@pops/ui';

import type { SeasonInfo } from '../RequestSeriesModal';

interface BulkControlsProps {
  seasons: SeasonInfo[];
  allChecked: boolean;
  noneChecked: boolean;
  disabled: boolean;
  setSeasonMonitored: (v: Record<number, boolean>) => void;
}

function BulkControls({
  seasons,
  allChecked,
  noneChecked,
  disabled,
  setSeasonMonitored,
}: BulkControlsProps) {
  return (
    <div className="flex gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
        disabled={allChecked || disabled}
        onClick={() => {
          const all: Record<number, boolean> = {};
          for (const s of seasons) all[s.seasonNumber] = true;
          setSeasonMonitored(all);
        }}
      >
        Select All
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
        disabled={noneChecked || disabled}
        onClick={() => {
          const none: Record<number, boolean> = {};
          for (const s of seasons) none[s.seasonNumber] = false;
          setSeasonMonitored(none);
        }}
      >
        Deselect All
      </Button>
    </div>
  );
}

interface SeasonMonitoringListProps {
  seasons: SeasonInfo[];
  seasonMonitored: Record<number, boolean>;
  setSeasonMonitored: (
    v: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)
  ) => void;
  disabled: boolean;
  allChecked: boolean;
  noneChecked: boolean;
}

export function SeasonMonitoringList({
  seasons,
  seasonMonitored,
  setSeasonMonitored,
  disabled,
  allChecked,
  noneChecked,
}: SeasonMonitoringListProps) {
  if (seasons.length === 0) return null;
  const showBulkControls = seasons.length > 3;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Season Monitoring</span>
        {showBulkControls && (
          <BulkControls
            seasons={seasons}
            allChecked={allChecked}
            noneChecked={noneChecked}
            disabled={disabled}
            setSeasonMonitored={setSeasonMonitored}
          />
        )}
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
        {seasons.map((s) => (
          <Label
            key={s.seasonNumber}
            className="flex items-center gap-2 text-sm cursor-pointer font-normal"
          >
            <input
              type="checkbox"
              checked={seasonMonitored[s.seasonNumber] ?? false}
              onChange={(e) => {
                setSeasonMonitored((prev) => ({
                  ...prev,
                  [s.seasonNumber]: e.target.checked,
                }));
              }}
              disabled={disabled}
            />
            {s.seasonNumber === 0 ? 'Specials' : `Season ${s.seasonNumber}`}
            {s.firstAirDate && (
              <span className="text-muted-foreground">— {s.firstAirDate.slice(0, 4)}</span>
            )}
          </Label>
        ))}
      </div>
    </div>
  );
}
