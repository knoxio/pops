import { useEffect } from 'react';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import type { SeasonInfo } from '../RequestSeriesModal';

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  path: string;
  freeSpace: number;
}

interface LanguageProfile {
  id: number;
  name: string;
}

interface QualityProfilesResult {
  data: QualityProfile[];
}

interface RootFoldersResult {
  data: RootFolder[];
}

interface LanguageProfilesResult {
  data: LanguageProfile[];
}

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
  const profiles = usePillarQuery<QualityProfilesResult>(
    'media',
    ['arr', 'getSonarrQualityProfiles'],
    undefined,
    { enabled: open, retry: false }
  );
  const folders = usePillarQuery<RootFoldersResult>(
    'media',
    ['arr', 'getSonarrRootFolders'],
    undefined,
    { enabled: open, retry: false }
  );
  const languages = usePillarQuery<LanguageProfilesResult>(
    'media',
    ['arr', 'getSonarrLanguageProfiles'],
    undefined,
    { enabled: open, retry: false }
  );
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
