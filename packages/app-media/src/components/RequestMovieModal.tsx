import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * RequestMovieModal — Modal for adding a movie to Radarr.
 *
 * Presents quality profile and root folder dropdowns,
 * then submits to Radarr's addMovie endpoint.
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function RequestMovieModal({ open, onClose, tmdbId, title, year }: RequestMovieModalProps) {
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profiles = trpc.media.arr.getQualityProfiles.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const folders = trpc.media.arr.getRootFolders.useQuery(undefined, {
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

  const utils = trpc.useUtils();

  const addMovie = trpc.media.arr.addMovie.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      utils.media.arr.getMovieStatus.invalidate({ tmdbId });
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setQualityProfileId(null);
        setRootFolderPath('');
      }, 1500);
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  const handleClose = () => {
    if (!addMovie.isPending) {
      onClose();
      setError(null);
      setSuccess(false);
      setQualityProfileId(null);
      setRootFolderPath('');
    }
  };

  const profileList = profiles.data?.data ?? [];
  const folderList = folders.data?.data ?? [];
  const isDataLoading = profiles.isLoading || folders.isLoading;
  const canSubmit = qualityProfileId !== null && rootFolderPath && !addMovie.isPending && !success;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Movie</DialogTitle>
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
          ) : profileList.length === 0 || folderList.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-destructive/80">
                {profileList.length === 0 ? 'No quality profiles found' : 'No root folders found'}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  profiles.refetch();
                  folders.refetch();
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
                disabled={addMovie.isPending || success}
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
                disabled={addMovie.isPending || success}
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
            <Button variant="outline" onClick={handleClose} disabled={addMovie.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (qualityProfileId !== null && rootFolderPath) {
                  setError(null);
                  addMovie.mutate({
                    tmdbId,
                    title,
                    year,
                    qualityProfileId,
                    rootFolderPath,
                  });
                }
              }}
              disabled={!canSubmit}
            >
              {success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Movie Added
                </>
              ) : addMovie.isPending ? (
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
