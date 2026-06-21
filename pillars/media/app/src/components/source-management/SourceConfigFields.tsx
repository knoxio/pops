import { Label, NumberInput, Select } from '@pops/ui';

interface FieldsProps {
  type: string;
  configValues: Record<string, unknown>;
  setConfigValues: (v: Record<string, unknown>) => void;
  plexFriendsQuery: {
    isLoading: boolean;
    data?:
      | { error: string; friends: { uuid: string; username: string }[] }
      | { error: null; friends: { uuid: string; username: string }[] }
      | undefined;
  };
}

function PlexFriendsField({
  configValues,
  setConfigValues,
  plexFriendsQuery,
}: Pick<FieldsProps, 'configValues' | 'setConfigValues' | 'plexFriendsQuery'>) {
  if (plexFriendsQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading friends...</p>;
  }
  if (plexFriendsQuery.data && plexFriendsQuery.data.error) {
    return <p className="text-xs text-destructive/80">{plexFriendsQuery.data.error}</p>;
  }
  const friends = plexFriendsQuery.data?.friends ?? [];
  return (
    <Select
      value={(configValues.friendUuid as string) ?? ''}
      onChange={(e) => {
        const friend = friends.find((f) => f.uuid === e.target.value);
        setConfigValues({
          friendUuid: e.target.value,
          friendUsername: friend?.username ?? '',
        });
      }}
      options={[
        { value: '', label: 'Select a friend...' },
        ...friends.map((f) => ({ value: f.uuid, label: f.username })),
      ]}
      size="sm"
    />
  );
}

function LetterboxdField({
  configValues,
  setConfigValues,
}: Pick<FieldsProps, 'configValues' | 'setConfigValues'>) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      value={(configValues.listUrl as string) ?? ''}
      onChange={(e) => {
        setConfigValues({ ...configValues, listUrl: e.target.value });
      }}
      placeholder="https://letterboxd.com/user/list/name/"
    />
  );
}

function TmdbTopRatedField({
  configValues,
  setConfigValues,
}: Pick<FieldsProps, 'configValues' | 'setConfigValues'>) {
  return (
    <>
      <NumberInput
        value={(configValues.pages as number) ?? 5}
        onChange={(e) => {
          setConfigValues({
            ...configValues,
            pages: Math.min(25, Math.max(1, Number(e.target.value) || 5)),
          });
        }}
        min={1}
        max={25}
      />
      <p className="text-xs text-muted-foreground">~20 movies per page</p>
    </>
  );
}

export function SourceConfigFields(props: FieldsProps) {
  const { type } = props;
  if (type === 'plex_friends') {
    return (
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Plex Friend</Label>
        <PlexFriendsField {...props} />
      </div>
    );
  }
  if (type === 'letterboxd') {
    return (
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">List URL</Label>
        <LetterboxdField {...props} />
      </div>
    );
  }
  if (type === 'tmdb_top_rated') {
    return (
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Pages to fetch (1-25)</Label>
        <TmdbTopRatedField {...props} />
      </div>
    );
  }
  return null;
}
