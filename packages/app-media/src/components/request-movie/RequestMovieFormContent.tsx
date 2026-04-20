import { Button, formatBytes, Select } from '@pops/ui';

interface Profile {
  id: number;
  name: string;
}

interface Folder {
  path: string;
  freeSpace: number;
}

interface RequestMovieFormContentProps {
  isDownloadMode: boolean;
  profileList: Profile[];
  folderList: Folder[];
  qualityProfileId: number | null;
  setQualityProfileId: (v: number | null) => void;
  rootFolderPath: string;
  setRootFolderPath: (v: string) => void;
  isPending: boolean;
  success: boolean;
  onRetry: () => void;
}

function ProfileFolderEmptyState({
  profileList,
  onRetry,
}: Pick<RequestMovieFormContentProps, 'profileList' | 'onRetry'>) {
  return (
    <div className="text-center py-4 space-y-2">
      <p className="text-sm text-destructive/80">
        {profileList.length === 0 ? 'No quality profiles found' : 'No root folders found'}.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ProfileFolderSelects({
  profileList,
  folderList,
  qualityProfileId,
  setQualityProfileId,
  rootFolderPath,
  setRootFolderPath,
  isPending,
  success,
}: Omit<RequestMovieFormContentProps, 'isDownloadMode' | 'onRetry'>) {
  return (
    <>
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
  );
}

export function RequestMovieFormContent(props: RequestMovieFormContentProps) {
  if (props.isDownloadMode) {
    return (
      <p className="text-sm text-muted-foreground">
        This movie will be added to Radarr using your rotation settings and marked as protected.
      </p>
    );
  }
  if (props.profileList.length === 0 || props.folderList.length === 0) {
    return <ProfileFolderEmptyState {...props} />;
  }
  return <ProfileFolderSelects {...props} />;
}
