import { Button, formatBytes, Select } from '@pops/ui';

import { SeasonMonitoringList } from './SeasonMonitoringList';

import type { SeasonInfo } from '../RequestSeriesModal';

interface ListItem {
  id?: number;
  name?: string;
  path?: string;
  freeSpace?: number;
}

interface FormProps {
  profileList: { id: number; name: string }[];
  folderList: { path: string; freeSpace: number }[];
  languageList: { id: number; name: string }[];
  qualityProfileId: number | null;
  setQualityProfileId: (v: number | null) => void;
  rootFolderPath: string;
  setRootFolderPath: (v: string) => void;
  languageProfileId: number | null;
  setLanguageProfileId: (v: number | null) => void;
  disabled: boolean;
  onRetry: () => void;
  seasons: SeasonInfo[];
  seasonMonitored: Record<number, boolean>;
  setSeasonMonitored: (
    v: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)
  ) => void;
  allChecked: boolean;
  noneChecked: boolean;
}

function getEmptyMessage(profileList: ListItem[], folderList: ListItem[]): string {
  if (profileList.length === 0) return 'No quality profiles found';
  if (folderList.length === 0) return 'No root folders found';
  return 'No language profiles found';
}

function EmptyState({
  profileList,
  folderList,
  onRetry,
}: Pick<FormProps, 'profileList' | 'folderList' | 'onRetry'>) {
  return (
    <div className="text-center py-4 space-y-2">
      <p className="text-sm text-destructive/80">{getEmptyMessage(profileList, folderList)}.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ProfileSelects({
  profileList,
  folderList,
  languageList,
  qualityProfileId,
  setQualityProfileId,
  rootFolderPath,
  setRootFolderPath,
  languageProfileId,
  setLanguageProfileId,
  disabled,
}: Omit<
  FormProps,
  'onRetry' | 'seasons' | 'seasonMonitored' | 'setSeasonMonitored' | 'allChecked' | 'noneChecked'
>) {
  return (
    <>
      <Select
        label="Quality Profile"
        id="quality-profile"
        value={String(qualityProfileId ?? '')}
        onChange={(e) => {
          setQualityProfileId(Number(e.target.value));
        }}
        disabled={disabled}
        options={profileList.map((p) => ({ value: String(p.id), label: p.name }))}
      />
      <Select
        label="Root Folder"
        id="root-folder"
        value={rootFolderPath}
        onChange={(e) => {
          setRootFolderPath(e.target.value);
        }}
        disabled={disabled}
        options={folderList.map((f) => ({
          value: f.path,
          label: `${f.path} (${formatBytes(f.freeSpace)} free)`,
        }))}
      />
      <Select
        label="Language Profile"
        id="language-profile"
        value={String(languageProfileId ?? '')}
        onChange={(e) => {
          setLanguageProfileId(Number(e.target.value));
        }}
        disabled={disabled}
        options={languageList.map((l) => ({ value: String(l.id), label: l.name }))}
      />
    </>
  );
}

export function RequestSeriesForm(props: FormProps) {
  const { profileList, folderList, languageList } = props;
  if (profileList.length === 0 || folderList.length === 0 || languageList.length === 0) {
    return <EmptyState {...props} />;
  }
  return (
    <>
      <ProfileSelects {...props} />
      <SeasonMonitoringList
        seasons={props.seasons}
        seasonMonitored={props.seasonMonitored}
        setSeasonMonitored={props.setSeasonMonitored}
        disabled={props.disabled}
        allChecked={props.allChecked}
        noneChecked={props.noneChecked}
      />
    </>
  );
}
