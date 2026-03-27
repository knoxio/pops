/**
 * RequestSeriesModal — modal for requesting a TV series via Sonarr.
 *
 * Shows quality profile, root folder, and language profile dropdowns,
 * plus season checkboxes with smart defaults (future/current checked, past unchecked).
 */
import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Checkbox,
  Label,
  Select,
} from "@pops/ui";
import { Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

export interface SeasonInfo {
  seasonNumber: number;
  /** Air date string (ISO or year), used for smart defaults. */
  airDate?: string | null;
}

export interface RequestSeriesModalProps {
  open: boolean;
  onClose: () => void;
  tvdbId: number;
  title: string;
  year?: number | null;
  seasons: SeasonInfo[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function isFutureSeason(airDate?: string | null): boolean {
  if (!airDate) return true; // Unknown air date → treat as future
  return new Date(airDate) > new Date();
}

export function RequestSeriesModal({
  open,
  onClose,
  tvdbId,
  title,
  year,
  seasons,
}: RequestSeriesModalProps) {
  const qualityProfiles = trpc.media.arr.getSonarrQualityProfiles.useQuery(undefined, {
    enabled: open,
  });
  const rootFolders = trpc.media.arr.getSonarrRootFolders.useQuery(undefined, { enabled: open });
  const languageProfiles = trpc.media.arr.getSonarrLanguageProfiles.useQuery(undefined, {
    enabled: open,
  });

  const addSeries = trpc.media.arr.addSeries.useMutation();

  // Dropdown selections — default to first option once data loads
  const [qualityProfileId, setQualityProfileId] = useState<string>("");
  const [rootFolderPath, setRootFolderPath] = useState<string>("");
  const [languageProfileId, setLanguageProfileId] = useState<string>("");

  // Auto-select first option when data loads
  useEffect(() => {
    const profiles = qualityProfiles.data?.data;
    if (profiles?.length && !qualityProfileId) {
      setQualityProfileId(String(profiles[0]!.id));
    }
  }, [qualityProfiles.data, qualityProfileId]);

  useEffect(() => {
    const folders = rootFolders.data?.data;
    if (folders?.length && !rootFolderPath) {
      setRootFolderPath(folders[0]!.path);
    }
  }, [rootFolders.data, rootFolderPath]);

  useEffect(() => {
    const profiles = languageProfiles.data?.data;
    if (profiles?.length && !languageProfileId) {
      setLanguageProfileId(String(profiles[0]!.id));
    }
  }, [languageProfiles.data, languageProfileId]);

  // Season monitoring state — smart defaults
  const sortedSeasons = useMemo(
    () => [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber),
    [seasons]
  );

  const [monitoredSeasons, setMonitoredSeasons] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (const s of seasons) {
      if (isFutureSeason(s.airDate)) {
        initial.add(s.seasonNumber);
      }
    }
    return initial;
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleSeason = (seasonNumber: number): void => {
    setMonitoredSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) {
        next.delete(seasonNumber);
      } else {
        next.add(seasonNumber);
      }
      return next;
    });
  };

  const selectAll = (): void => {
    setMonitoredSeasons(new Set(sortedSeasons.map((s) => s.seasonNumber)));
  };

  const deselectAll = (): void => {
    setMonitoredSeasons(new Set());
  };

  const allSelected = qualityProfileId && rootFolderPath && languageProfileId;

  const handleRequest = async (): Promise<void> => {
    if (!allSelected) return;
    setError(null);

    try {
      await addSeries.mutateAsync({
        tvdbId,
        title,
        qualityProfileId: Number(qualityProfileId),
        rootFolderPath,
        languageProfileId: Number(languageProfileId),
        seasons: sortedSeasons.map((s) => ({
          seasonNumber: s.seasonNumber,
          monitored: monitoredSeasons.has(s.seasonNumber),
        })),
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add series");
    }
  };

  const qualityOptions =
    qualityProfiles.data?.data?.map((p) => ({ value: String(p.id), label: p.name })) ?? [];
  const rootFolderOptions =
    rootFolders.data?.data?.map((f) => ({
      value: f.path,
      label: `${f.path} (${formatBytes(f.freeSpace)} free)`,
    })) ?? [];
  const languageOptions =
    languageProfiles.data?.data?.map((p) => ({ value: String(p.id), label: p.name })) ?? [];

  const isLoading =
    qualityProfiles.isLoading || rootFolders.isLoading || languageProfiles.isLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby="request-series-description">
        <DialogHeader>
          <DialogTitle>
            Request {title}
            {year ? ` (${year})` : ""}
          </DialogTitle>
          <DialogDescription id="request-series-description">
            Add this series to Sonarr for downloading.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              label="Quality Profile"
              options={qualityOptions}
              value={qualityProfileId}
              onChange={(e) => setQualityProfileId(e.target.value)}
              placeholder="Select quality profile..."
              data-testid="quality-profile-select"
            />

            <Select
              label="Root Folder"
              options={rootFolderOptions}
              value={rootFolderPath}
              onChange={(e) => setRootFolderPath(e.target.value)}
              placeholder="Select root folder..."
              data-testid="root-folder-select"
            />

            <Select
              label="Language Profile"
              options={languageOptions}
              value={languageProfileId}
              onChange={(e) => setLanguageProfileId(e.target.value)}
              placeholder="Select language profile..."
              data-testid="language-profile-select"
            />

            {/* Season monitoring */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Seasons
                </Label>
                {sortedSeasons.length > 3 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={selectAll}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={deselectAll}
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>

              <div
                className={
                  sortedSeasons.length > 10
                    ? "max-h-60 overflow-y-auto flex flex-col gap-1.5"
                    : "flex flex-col gap-1.5"
                }
              >
                {sortedSeasons.map((season) => (
                  <label
                    key={season.seasonNumber}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={monitoredSeasons.has(season.seasonNumber)}
                      onCheckedChange={() => toggleSeason(season.seasonNumber)}
                      aria-label={`Season ${season.seasonNumber}`}
                    />
                    <span className="text-sm">
                      Season {season.seasonNumber}
                      {season.airDate ? ` — ${season.airDate.slice(0, 4)}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-500">Series added successfully!</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={addSeries.isPending}>
            Cancel
          </Button>
          <Button onClick={handleRequest} disabled={!allSelected || addSeries.isPending || success}>
            {addSeries.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
