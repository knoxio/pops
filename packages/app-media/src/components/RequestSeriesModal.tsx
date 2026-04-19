import { RequestDialog } from '@pops/ui';

/**
 * RequestSeriesModal — Modal for adding a TV series to Sonarr.
 *
 * Presents quality profile, root folder, and language profile dropdowns,
 * season monitoring checkboxes with smart defaults, then submits to Sonarr.
 */
import { RequestSeriesForm } from './request-series/RequestSeriesForm';
import { useRequestSeriesModel } from './request-series/useRequestSeriesModel';

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

function computeCanSubmit(model: ReturnType<typeof useRequestSeriesModel>): boolean {
  const { state, addSeries } = model;
  return (
    state.qualityProfileId !== null &&
    !!state.rootFolderPath &&
    state.languageProfileId !== null &&
    !addSeries.isPending &&
    !state.success
  );
}

export function RequestSeriesModal({
  open,
  onClose,
  tvdbId,
  title,
  year,
  seasons,
}: RequestSeriesModalProps) {
  const model = useRequestSeriesModel({ open, onClose, tvdbId, title, seasons });
  const { state, queries, addSeries } = model;

  const profileList = queries.profiles.data?.data ?? [];
  const folderList = queries.folders.data?.data ?? [];
  const languageList = queries.languages.data?.data ?? [];
  const isDataLoading =
    queries.profiles.isLoading || queries.folders.isLoading || queries.languages.isLoading;

  const canSubmit = computeCanSubmit(model);

  return (
    <RequestDialog
      open={open}
      onClose={model.handleClose}
      title="Request Series"
      description={`${title} (${year})`}
      isLoading={isDataLoading}
      error={state.error}
      canSubmit={canSubmit}
      isPending={addSeries.isPending}
      isSuccess={state.success}
      successLabel="Series Added"
      onSubmit={model.handleSubmit}
    >
      <RequestSeriesForm
        profileList={profileList}
        folderList={folderList}
        languageList={languageList}
        qualityProfileId={state.qualityProfileId}
        setQualityProfileId={state.setQualityProfileId}
        rootFolderPath={state.rootFolderPath}
        setRootFolderPath={state.setRootFolderPath}
        languageProfileId={state.languageProfileId}
        setLanguageProfileId={state.setLanguageProfileId}
        disabled={addSeries.isPending || state.success}
        onRetry={() => {
          void queries.profiles.refetch();
          void queries.folders.refetch();
          void queries.languages.refetch();
        }}
        seasons={seasons}
        seasonMonitored={state.seasonMonitored}
        setSeasonMonitored={state.setSeasonMonitored}
        allChecked={model.allChecked}
        noneChecked={model.noneChecked}
      />
    </RequestDialog>
  );
}
