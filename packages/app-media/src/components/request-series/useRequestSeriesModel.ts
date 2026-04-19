import { useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useSeriesDefaults, useSeriesQueries } from './useRequestSeriesQueries';

import type { SeasonInfo } from '../RequestSeriesModal';

interface ModelArgs {
  open: boolean;
  onClose: () => void;
  tvdbId: number;
  title: string;
  seasons: SeasonInfo[];
}

function useFormState() {
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [languageProfileId, setLanguageProfileId] = useState<number | null>(null);
  const [seasonMonitored, setSeasonMonitored] = useState<Record<number, boolean>>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    qualityProfileId,
    setQualityProfileId,
    rootFolderPath,
    setRootFolderPath,
    languageProfileId,
    setLanguageProfileId,
    seasonMonitored,
    setSeasonMonitored,
    success,
    setSuccess,
    error,
    setError,
  };
}

function useSubmit({
  state,
  args,
  resetState,
}: {
  state: ReturnType<typeof useFormState>;
  args: ModelArgs;
  resetState: () => void;
}) {
  const addSeries = trpc.media.arr.addSeries.useMutation({
    onSuccess: () => {
      state.setSuccess(true);
      state.setError(null);
      setTimeout(() => {
        args.onClose();
        resetState();
      }, 1500);
    },
    onError: (err: { message: string }) => state.setError(err.message),
  });

  const handleSubmit = () => {
    if (
      state.qualityProfileId !== null &&
      state.rootFolderPath &&
      state.languageProfileId !== null
    ) {
      state.setError(null);
      addSeries.mutate({
        tvdbId: args.tvdbId,
        title: args.title,
        qualityProfileId: state.qualityProfileId,
        rootFolderPath: state.rootFolderPath,
        languageProfileId: state.languageProfileId,
        seasons: args.seasons.map((s) => ({
          seasonNumber: s.seasonNumber,
          monitored: state.seasonMonitored[s.seasonNumber] ?? false,
        })),
      });
    }
  };

  return { addSeries, handleSubmit };
}

export function useRequestSeriesModel(args: ModelArgs) {
  const state = useFormState();
  const queries = useSeriesQueries(args.open);

  useSeriesDefaults({
    firstProfileId: queries.profiles.data?.data?.[0]?.id,
    firstFolderPath: queries.folders.data?.data?.[0]?.path,
    firstLanguageId: queries.languages.data?.data?.[0]?.id,
    qualityProfileId: state.qualityProfileId,
    rootFolderPath: state.rootFolderPath,
    languageProfileId: state.languageProfileId,
    seasons: args.seasons,
    seasonMonitored: state.seasonMonitored,
    setQualityProfileId: state.setQualityProfileId,
    setRootFolderPath: state.setRootFolderPath,
    setLanguageProfileId: state.setLanguageProfileId,
    setSeasonMonitored: state.setSeasonMonitored,
  });

  const resetState = () => {
    state.setSuccess(false);
    state.setQualityProfileId(null);
    state.setRootFolderPath('');
    state.setLanguageProfileId(null);
    state.setSeasonMonitored({});
    state.setError(null);
  };

  const { addSeries, handleSubmit } = useSubmit({ state, args, resetState });

  const handleClose = () => {
    if (!addSeries.isPending) {
      args.onClose();
      resetState();
    }
  };

  const allChecked = useMemo(
    () =>
      args.seasons.length > 0 && args.seasons.every((s) => state.seasonMonitored[s.seasonNumber]),
    [args.seasons, state.seasonMonitored]
  );
  const noneChecked = useMemo(
    () =>
      args.seasons.length > 0 && args.seasons.every((s) => !state.seasonMonitored[s.seasonNumber]),
    [args.seasons, state.seasonMonitored]
  );

  return {
    state,
    queries,
    addSeries,
    handleSubmit,
    handleClose,
    allChecked,
    noneChecked,
  };
}
