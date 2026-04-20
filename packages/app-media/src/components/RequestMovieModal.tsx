import { RequestDialog } from '@pops/ui';

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
import { RequestMovieFormContent } from './request-movie/RequestMovieFormContent';
import { useRequestMovieModel } from './request-movie/useRequestMovieModel';

interface RequestMovieModalProps {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  title: string;
  year: number;
  /** `'request'` (default) uses addMovie; `'download'` uses downloadAndProtect. */
  mode?: 'request' | 'download';
}

type Model = ReturnType<typeof useRequestMovieModel>;

function getCanSubmit(model: Model, isDownloadMode: boolean): boolean {
  if (isDownloadMode) return !model.isPending && !model.success;
  return (
    model.qualityProfileId !== null &&
    model.rootFolderPath !== '' &&
    !model.isPending &&
    !model.success
  );
}

function ModalLabels({ isDownloadMode }: { isDownloadMode: boolean }) {
  if (isDownloadMode) {
    return {
      title: 'Download Movie',
      submit: 'Download',
      success: 'Movie Downloaded',
      pending: 'Downloading...',
    };
  }
  return {
    title: 'Request Movie',
    submit: 'Request',
    success: 'Movie Added',
    pending: 'Adding...',
  };
}

export function RequestMovieModal({
  open,
  onClose,
  tmdbId,
  title,
  year,
  mode = 'request',
}: RequestMovieModalProps) {
  const isDownloadMode = mode === 'download';
  const model = useRequestMovieModel({
    open,
    onClose,
    tmdbId,
    title,
    year,
    isDownloadMode,
  });

  const profileList = model.profiles.data?.data ?? [];
  const folderList = model.folders.data?.data ?? [];
  const isDataLoading = !isDownloadMode && (model.profiles.isLoading || model.folders.isLoading);
  const labels = ModalLabels({ isDownloadMode });

  return (
    <RequestDialog
      open={open}
      onClose={model.handleClose}
      title={labels.title}
      description={`${title} (${year})`}
      isLoading={isDataLoading}
      error={model.error}
      canSubmit={getCanSubmit(model, isDownloadMode)}
      isPending={model.isPending}
      isSuccess={model.success}
      submitLabel={labels.submit}
      successLabel={labels.success}
      pendingLabel={labels.pending}
      onSubmit={model.handleSubmit}
    >
      <RequestMovieFormContent
        isDownloadMode={isDownloadMode}
        profileList={profileList}
        folderList={folderList}
        qualityProfileId={model.qualityProfileId}
        setQualityProfileId={model.setQualityProfileId}
        rootFolderPath={model.rootFolderPath}
        setRootFolderPath={model.setRootFolderPath}
        isPending={model.isPending}
        success={model.success}
        onRetry={() => {
          void model.profiles.refetch();
          void model.folders.refetch();
        }}
      />
    </RequestDialog>
  );
}
