import { useEffect } from 'react';

import { trpc } from '@pops/api-client';

import type { SeasonInfo } from '../RequestSeriesModal';

function isFutureSeason(firstAirDate: string | null): boolean {
  if (!firstAirDate) return true;
  return new Date(firstAirDate) > new Date();
}

interface DefaultsArgs {
  firstProfileId: number | undefined;
  firstFolderPath: string | undefined;
  firstLanguageId: number | undefined;
  qualityProfileId: number | null;
  rootFolderPath: string;
  languageProfileId: number | null;
  seasons: SeasonInfo[];
  seasonMonitored: Record<number, boolean>;
  setQualityProfileId: (v: number) => void;
  setRootFolderPath: (v: string) => void;
  setLanguageProfileId: (v: number) => void;
  setSeasonMonitored: (v: Record<number, boolean>) => void;
}

export function useSeriesQueries(open: boolean) {
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
  return { profiles, folders, languages };
}

export function useSeriesDefaults(args: DefaultsArgs) {
  useEffect(() => {
    if (args.firstProfileId !== undefined && args.qualityProfileId === null) {
      args.setQualityProfileId(args.firstProfileId);
    }
  }, [args]);

  useEffect(() => {
    if (args.firstFolderPath && !args.rootFolderPath) {
      args.setRootFolderPath(args.firstFolderPath);
    }
  }, [args]);

  useEffect(() => {
    if (args.firstLanguageId !== undefined && args.languageProfileId === null) {
      args.setLanguageProfileId(args.firstLanguageId);
    }
  }, [args]);

  useEffect(() => {
    if (args.seasons.length > 0 && Object.keys(args.seasonMonitored).length === 0) {
      const defaults: Record<number, boolean> = {};
      for (const s of args.seasons) {
        defaults[s.seasonNumber] = isFutureSeason(s.firstAirDate);
      }
      args.setSeasonMonitored(defaults);
    }
  }, [args]);
}
