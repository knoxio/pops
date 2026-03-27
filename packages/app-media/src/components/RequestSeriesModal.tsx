/**
 * RequestSeriesModal — Modal for adding a TV series to Sonarr.
 *
 * Presents quality profile, root folder, and language profile dropdowns,
 * season monitoring checkboxes with smart defaults, then submits to Sonarr.
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@pops/ui";
import { Button } from "@pops/ui";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { trpc } from "../lib/trpc";

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
  const [rootFolderPath, setRootFolderPath] = useState<string>("");
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
    setRootFolderPath("");
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
              <p className="text-sm text-red-400">
                {profileList.length === 0
                  ? "No quality profiles found"
                  : folderList.length === 0
                    ? "No root folders found"
                    : "No language profiles found"}
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
              <div className="space-y-1.5">
                <label htmlFor="quality-profile" className="text-sm font-medium">
                  Quality Profile
                </label>
                <select
                  id="quality-profile"
                  value={qualityProfileId ?? ""}
                  onChange={(e) => setQualityProfileId(Number(e.target.value))}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  disabled={addSeries.isPending || success}
                >
                  {profileList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Root Folder */}
              <div className="space-y-1.5">
                <label htmlFor="root-folder" className="text-sm font-medium">
                  Root Folder
                </label>
                <select
                  id="root-folder"
                  value={rootFolderPath}
                  onChange={(e) => setRootFolderPath(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  disabled={addSeries.isPending || success}
                >
                  {folderList.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path} ({formatBytes(f.freeSpace)} free)
                    </option>
                  ))}
                </select>
              </div>

              {/* Language Profile */}
              <div className="space-y-1.5">
                <label htmlFor="language-profile" className="text-sm font-medium">
                  Language Profile
                </label>
                <select
                  id="language-profile"
                  value={languageProfileId ?? ""}
                  onChange={(e) => setLanguageProfileId(Number(e.target.value))}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  disabled={addSeries.isPending || success}
                >
                  {languageList.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Season Monitoring */}
              {seasons.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Season Monitoring</span>
                    {showBulkControls && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          disabled={allChecked || addSeries.isPending || success}
                          onClick={() => {
                            const all: Record<number, boolean> = {};
                            for (const s of seasons) all[s.seasonNumber] = true;
                            setSeasonMonitored(all);
                          }}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          disabled={noneChecked || addSeries.isPending || success}
                          onClick={() => {
                            const none: Record<number, boolean> = {};
                            for (const s of seasons) none[s.seasonNumber] = false;
                            setSeasonMonitored(none);
                          }}
                        >
                          Deselect All
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                    {seasons.map((s) => (
                      <label
                        key={s.seasonNumber}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={seasonMonitored[s.seasonNumber] ?? false}
                          onChange={(e) =>
                            setSeasonMonitored((prev) => ({
                              ...prev,
                              [s.seasonNumber]: e.target.checked,
                            }))
                          }
                          disabled={addSeries.isPending || success}
                        />
                        {s.seasonNumber === 0 ? "Specials" : `Season ${s.seasonNumber}`}
                        {s.firstAirDate && (
                          <span className="text-muted-foreground">
                            — {s.firstAirDate.slice(0, 4)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && <p className="text-sm text-red-400">{error}</p>}

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
                "Request"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
