import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import {
  arrAddMovie,
  arrDownloadAndProtect,
  arrGetRadarrQualityProfiles,
  arrGetRadarrRootFolders,
} from '../../media-api/index.js';

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  path: string;
  freeSpace: number;
}

interface QualityProfilesResult {
  data: QualityProfile[];
}

interface RootFoldersResult {
  data: RootFolder[];
}

interface AddMovieInput {
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
  rootFolderPath: string;
}

interface DownloadAndProtectInput {
  tmdbId: number;
  title: string;
  year: number;
}

interface RequestMovieModelArgs {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  title: string;
  year: number;
  isDownloadMode: boolean;
}

function useProfilesAndFolders(open: boolean, isDownloadMode: boolean) {
  const profiles = useQuery<QualityProfilesResult>({
    queryKey: ['media', 'arr', 'getQualityProfiles'],
    queryFn: async () => unwrap(await arrGetRadarrQualityProfiles()),
    enabled: open && !isDownloadMode,
    retry: false,
  });
  const folders = useQuery<RootFoldersResult>({
    queryKey: ['media', 'arr', 'getRootFolders'],
    queryFn: async () => unwrap(await arrGetRadarrRootFolders()),
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
  onClose: () => void;
  resetState: () => void;
  setError: (v: string | null) => void;
  setSuccess: (v: boolean) => void;
}

function useRequestMutations({ onClose, resetState, setError, setSuccess }: MutationArgs) {
  const queryClient = useQueryClient();
  const onMutationSuccess = () => {
    setSuccess(true);
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['media', 'arr'] });
    setTimeout(() => {
      onClose();
      resetState();
    }, 1500);
  };
  const onMutationError = (err: Error) => setError(err.message);
  const addMovie = useMutation({
    mutationFn: async (input: AddMovieInput) => unwrap(await arrAddMovie({ body: input })),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  const downloadAndProtect = useMutation({
    mutationFn: async (input: DownloadAndProtectInput) =>
      unwrap(await arrDownloadAndProtect({ body: input })),
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
