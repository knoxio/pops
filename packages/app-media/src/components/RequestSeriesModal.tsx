import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * RequestSeriesModal — Modal for adding a TV series to Sonarr.
 *
 * Presents quality profile, root folder, and language profile dropdowns,
 * season monitoring checkboxes with smart defaults, then submits to Sonarr.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
} from '@pops/ui';
import { Button } from '@pops/ui';

import { trpc } from '../lib/trpc';

export interface SeasonInfo {
  seasonNumber: number;
  /** ISO date string for when the season first aired, or null if unannounced. */
  firstAirDate: string | null;
}

interface RequestSeriesModalProps {
  open: boolean;
  onClose: () => void;
  tvdbId: number;
  title: string;
  year: number;
  seasons: SeasonInfo[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Determine if a season is "future" (should be monitored by default). */
function isFutureSeason(firstAirDate: string | null): boolean {
  if (!firstAirDate) return true; // unannounced = future
  return new Date(firstAirDate) > new Date();
}

export function RequestSeriesModal({
  open,
  onClose,
  tvdbId,
  title,
  year,
  seasons,
}: RequestSeriesModalProps) {
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [languageProfileId, setLanguageProfileId] = useState<number | null>(null);
  const [seasonMonitored, setSeasonMonitored] = useState<Record<number, boolean>>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profiles = trpc.media.arr.getSonarrQualityProfiles.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const folders = trpc.media.arr.getSonarrRootFolders.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const languages = trpc.media.arr.getSonarrLanguageProfiles.useQuery(undefined, {
    enabled: open,
    retry: false,
  });

  // Default to first option once loaded
  useEffect(() => {
    if (profiles.data?.data?.length && qualityProfileId === null) {
      setQualityProfileId(profiles.data.data[0]!.id);
    }
  }, [profiles.data?.data, qualityProfileId]);

  useEffect(() => {
    if (folders.data?.data?.length && !rootFolderPath) {
      setRootFolderPath(folders.data.data[0]!.path);
    }
  }, [folders.data?.data, rootFolderPath]);

  useEffect(() => {
    if (languages.data?.data?.length && languageProfileId === null) {
      setLanguageProfileId(languages.data.data[0]!.id);
    }
  }, [languages.data?.data, languageProfileId]);

  // Set smart season defaults when seasons change
  useEffect(() => {
    if (seasons.length > 0 && Object.keys(seasonMonitored).length === 0) {
      const defaults: Record<number, boolean> = {};
      for (const s of seasons) {
        defaults[s.seasonNumber] = isFutureSeason(s.firstAirDate);
      }
      setSeasonMonitored(defaults);
    }
  }, [seasons, seasonMonitored]);

  const addSeries = trpc.media.arr.addSeries.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      setTimeout(() => {
        onClose();
        resetState();
      }, 1500);
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  function resetState() {
    setSuccess(false);
    setQualityProfileId(null);
    setRootFolderPath('');
    setLanguageProfileId(null);
    setSeasonMonitored({});
    setError(null);
  }

  const handleClose = () => {
    if (!addSeries.isPending) {
      onClose();
      resetState();
    }
  };

  const profileList = profiles.data?.data ?? [];
  const folderList = folders.data?.data ?? [];
  const languageList = languages.data?.data ?? [];
  const isDataLoading = profiles.isLoading || folders.isLoading || languages.isLoading;
  const canSubmit =
    qualityProfileId !== null &&
    rootFolderPath &&
    languageProfileId !== null &&
    !addSeries.isPending &&
    !success;

  const showBulkControls = seasons.length > 3;

  const allChecked = useMemo(
    () => seasons.length > 0 && seasons.every((s) => seasonMonitored[s.seasonNumber]),
    [seasons, seasonMonitored]
  );

  const noneChecked = useMemo(
    () => seasons.length > 0 && seasons.every((s) => !seasonMonitored[s.seasonNumber]),
    [seasons, seasonMonitored]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Series</DialogTitle>
          <DialogDescription>
            {title} ({year})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {isDataLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Loading options...
            </div>
          ) : profileList.length === 0 || folderList.length === 0 || languageList.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-destructive/80">
                {profileList.length === 0
                  ? 'No quality profiles found'
                  : folderList.length === 0
                    ? 'No root folders found'
                    : 'No language profiles found'}
                .
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  profiles.refetch();
                  folders.refetch();
                  languages.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Quality Profile */}
              <Select
                label="Quality Profile"
                id="quality-profile"
                value={String(qualityProfileId ?? '')}
                onChange={(e) => {
                  setQualityProfileId(Number(e.target.value));
                }}
                disabled={addSeries.isPending || success}
                options={profileList.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                }))}
              />

              {/* Root Folder */}
              <Select
                label="Root Folder"
                id="root-folder"
                value={rootFolderPath}
                onChange={(e) => {
                  setRootFolderPath(e.target.value);
                }}
                disabled={addSeries.isPending || success}
                options={folderList.map((f) => ({
                  value: f.path,
                  label: `${f.path} (${formatBytes(f.freeSpace)} free)`,
                }))}
              />

              {/* Language Profile */}
              <Select
                label="Language Profile"
                id="language-profile"
                value={String(languageProfileId ?? '')}
                onChange={(e) => {
                  setLanguageProfileId(Number(e.target.value));
                }}
                disabled={addSeries.isPending || success}
                options={languageList.map((l) => ({
                  value: String(l.id),
                  label: l.name,
                }))}
              />

              {/* Season Monitoring */}
              {seasons.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Season Monitoring</span>
                    {showBulkControls && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
                          disabled={allChecked || addSeries.isPending || success}
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
                          disabled={noneChecked || addSeries.isPending || success}
                          onClick={() => {
                            const none: Record<number, boolean> = {};
                            for (const s of seasons) none[s.seasonNumber] = false;
                            setSeasonMonitored(none);
                          }}
                        >
                          Deselect All
                        </Button>
                      </div>
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
                          disabled={addSeries.isPending || success}
                        />
                        {s.seasonNumber === 0 ? 'Specials' : `Season ${s.seasonNumber}`}
                        {s.firstAirDate && (
                          <span className="text-muted-foreground">
                            — {s.firstAirDate.slice(0, 4)}
                          </span>
                        )}
                      </Label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && <p className="text-sm text-destructive/80">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={addSeries.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (qualityProfileId !== null && rootFolderPath && languageProfileId !== null) {
                  setError(null);
                  addSeries.mutate({
                    tvdbId,
                    title,
                    qualityProfileId,
                    rootFolderPath,
                    languageProfileId,
                    seasons: seasons.map((s) => ({
                      seasonNumber: s.seasonNumber,
                      monitored: seasonMonitored[s.seasonNumber] ?? false,
                    })),
                  });
                }
              }}
              disabled={!canSubmit}
            >
              {success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Series Added
                </>
              ) : addSeries.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                  Adding...
                </>
              ) : (
                'Request'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
