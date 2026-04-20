import { useEffect, useState } from 'react';

import { trpc } from '@pops/api-client';

interface RequestMovieModelArgs {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  title: string;
  year: number;
  isDownloadMode: boolean;
}

function useProfilesAndFolders(open: boolean, isDownloadMode: boolean) {
  const profiles = trpc.media.arr.getQualityProfiles.useQuery(undefined, {
    enabled: open && !isDownloadMode,
    retry: false,
  });
  const folders = trpc.media.arr.getRootFolders.useQuery(undefined, {
    enabled: open && !isDownloadMode,
    retry: false,
  });
  return { profiles, folders };
}

interface DefaultsArgs {
  isDownloadMode: boolean;
  firstProfileId: number | undefined;
  firstFolderPath: string | undefined;
  qualityProfileId: number | null;
  rootFolderPath: string;
  setQualityProfileId: (v: number) => void;
  setRootFolderPath: (v: string) => void;
}

function useDefaults({
  isDownloadMode,
  firstProfileId,
  firstFolderPath,
  qualityProfileId,
  rootFolderPath,
  setQualityProfileId,
  setRootFolderPath,
}: DefaultsArgs) {
  useEffect(() => {
    if (!isDownloadMode && firstProfileId !== undefined && qualityProfileId === null) {
      setQualityProfileId(firstProfileId);
    }
  }, [isDownloadMode, firstProfileId, qualityProfileId, setQualityProfileId]);

  useEffect(() => {
    if (!isDownloadMode && firstFolderPath && !rootFolderPath) {
      setRootFolderPath(firstFolderPath);
    }
  }, [isDownloadMode, firstFolderPath, rootFolderPath, setRootFolderPath]);
}

interface MutationArgs {
  tmdbId: number;
  onClose: () => void;
  resetState: () => void;
  setError: (v: string | null) => void;
  setSuccess: (v: boolean) => void;
}

function useRequestMutations({ tmdbId, onClose, resetState, setError, setSuccess }: MutationArgs) {
  const utils = trpc.useUtils();
  const onMutationSuccess = () => {
    setSuccess(true);
    setError(null);
    void utils.media.arr.getMovieStatus.invalidate({ tmdbId });
    setTimeout(() => {
      onClose();
      resetState();
    }, 1500);
  };
  const onMutationError = (err: { message: string }) => setError(err.message);
  const addMovie = trpc.media.arr.addMovie.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  const downloadAndProtect = trpc.media.arr.downloadAndProtect.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  return { addMovie, downloadAndProtect };
}

export function useRequestMovieModel(args: RequestMovieModelArgs) {
  const { open, onClose, tmdbId, title, year, isDownloadMode } = args;
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { profiles, folders } = useProfilesAndFolders(open, isDownloadMode);
  useDefaults({
    isDownloadMode,
    firstProfileId: profiles.data?.data?.[0]?.id,
    firstFolderPath: folders.data?.data?.[0]?.path,
    qualityProfileId,
    rootFolderPath,
    setQualityProfileId,
    setRootFolderPath,
  });

  const resetState = () => {
    setSuccess(false);
    setQualityProfileId(null);
    setRootFolderPath('');
  };

  const { addMovie, downloadAndProtect } = useRequestMutations({
    tmdbId,
    onClose,
    resetState,
    setError,
    setSuccess,
  });

  const isPending = isDownloadMode ? downloadAndProtect.isPending : addMovie.isPending;

  const handleClose = () => {
    if (!isPending) {
      onClose();
      setError(null);
      resetState();
    }
  };

  const handleSubmit = () => {
    setError(null);
    if (isDownloadMode) {
      downloadAndProtect.mutate({ tmdbId, title, year });
    } else if (qualityProfileId !== null && rootFolderPath) {
      addMovie.mutate({ tmdbId, title, year, qualityProfileId, rootFolderPath });
    }
  };

  return {
    qualityProfileId,
    setQualityProfileId,
    rootFolderPath,
    setRootFolderPath,
    success,
    error,
    profiles,
    folders,
    isPending,
    handleClose,
    handleSubmit,
  };
}
