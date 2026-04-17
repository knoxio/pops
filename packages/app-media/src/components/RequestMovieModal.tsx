import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * RequestMovieModal — Modal for adding a movie to Radarr.
 *
 * In `'request'` mode (default): presents quality profile and root folder
 * dropdowns, then submits to Radarr's addMovie endpoint.
 *
 * In `'download'` mode: adds to Radarr using rotation settings, creates a
 * POPS library entry, and sets rotation_status = 'protected'. No profile or
 * folder selection is shown because those are read from server settings.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@pops/ui';
import { Button } from '@pops/ui';

import { trpc } from '../lib/trpc';

interface RequestMovieModalProps {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  title: string;
  year: number;
  /** `'request'` (default) uses addMovie; `'download'` uses downloadAndProtect. */
  mode?: 'request' | 'download';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function RequestMovieModal({
  open,
  onClose,
  tmdbId,
  title,
  year,
  mode = 'request',
}: RequestMovieModalProps) {
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDownloadMode = mode === 'download';

  const profiles = trpc.media.arr.getQualityProfiles.useQuery(undefined, {
    enabled: open && !isDownloadMode,
    retry: false,
  });
  const folders = trpc.media.arr.getRootFolders.useQuery(undefined, {
    enabled: open && !isDownloadMode,
    retry: false,
  });

  // Default to first option once loaded (request mode only)
  useEffect(() => {
    if (!isDownloadMode && profiles.data?.data?.length && qualityProfileId === null) {
      setQualityProfileId(profiles.data.data[0]!.id);
    }
  }, [isDownloadMode, profiles.data?.data, qualityProfileId]);

  useEffect(() => {
    if (!isDownloadMode && folders.data?.data?.length && !rootFolderPath) {
      setRootFolderPath(folders.data.data[0]!.path);
    }
  }, [isDownloadMode, folders.data?.data, rootFolderPath]);

  const utils = trpc.useUtils();

  const resetState = () => {
    setSuccess(false);
    setQualityProfileId(null);
    setRootFolderPath('');
  };

  const onMutationSuccess = () => {
    setSuccess(true);
    setError(null);
    void utils.media.arr.getMovieStatus.invalidate({ tmdbId });
    setTimeout(() => {
      onClose();
      resetState();
    }, 1500);
  };

  const onMutationError = (err: { message: string }) => {
    setError(err.message);
  };

  const addMovie = trpc.media.arr.addMovie.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const downloadAndProtect = trpc.media.arr.downloadAndProtect.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const isPending = isDownloadMode ? downloadAndProtect.isPending : addMovie.isPending;

  const handleClose = () => {
    if (!isPending) {
      onClose();
      setError(null);
      resetState();
    }
  };

  const profileList = profiles.data?.data ?? [];
  const folderList = folders.data?.data ?? [];
  const isDataLoading = !isDownloadMode && (profiles.isLoading || folders.isLoading);
  const canSubmit = isDownloadMode
    ? !isPending && !success
    : qualityProfileId !== null && rootFolderPath !== '' && !isPending && !success;

  const handleSubmit = () => {
    setError(null);
    if (isDownloadMode) {
      downloadAndProtect.mutate({ tmdbId, title, year });
    } else if (qualityProfileId !== null && rootFolderPath) {
      addMovie.mutate({ tmdbId, title, year, qualityProfileId, rootFolderPath });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDownloadMode ? 'Download Movie' : 'Request Movie'}</DialogTitle>
          <DialogDescription>
            {title} ({year})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {isDownloadMode ? (
            <p className="text-sm text-muted-foreground">
              This movie will be added to Radarr using your rotation settings and marked as
              protected.
            </p>
          ) : isDataLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Loading options...
            </div>
          ) : profileList.length === 0 || folderList.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-destructive/80">
                {profileList.length === 0 ? 'No quality profiles found' : 'No root folders found'}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void profiles.refetch();
                  void folders.refetch();
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
                disabled={isPending || success}
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
                disabled={isPending || success}
                options={folderList.map((f) => ({
                  value: f.path,
                  label: `${f.path} (${formatBytes(f.freeSpace)} free)`,
                }))}
              />
            </>
          )}

          {/* Error */}
          {error && <p className="text-sm text-destructive/80">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {isDownloadMode ? 'Movie Downloaded' : 'Movie Added'}
                </>
              ) : isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                  {isDownloadMode ? 'Downloading...' : 'Adding...'}
                </>
              ) : isDownloadMode ? (
                'Download'
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
