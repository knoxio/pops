import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import {
  rotationCreateSource,
  rotationListPlexFriends,
  rotationUpdateSource,
} from '../../media-api/index.js';

import type { SourceFormValues } from './types';

interface PlexFriend {
  uuid: string;
  username: string;
}

type PlexFriendsResult =
  | { error: string; friends: PlexFriend[] }
  | { error: null; friends: PlexFriend[] };

interface CreateSourceInput {
  type: string;
  name: string;
  priority: number;
  enabled: boolean;
  syncIntervalHours: number;
  config: Record<string, unknown>;
}

interface UpdateSourceInput {
  id: number;
  name: string;
  priority: number;
  enabled: boolean;
  syncIntervalHours: number;
  config: Record<string, unknown>;
}

interface UseSourceFormArgs {
  mode: 'create' | 'edit';
  initialValues?: SourceFormValues;
  sourceTypes: string[];
  onClose: () => void;
}

const FALLBACK_DEFAULTS = {
  type: 'plex_watchlist',
  name: '',
  priority: 5,
  enabled: true,
  syncIntervalHours: 24,
  configValues: {} as Record<string, unknown>,
};

function buildDefaults(initialValues: SourceFormValues | undefined, sourceTypes: string[]) {
  if (!initialValues) {
    return { ...FALLBACK_DEFAULTS, type: sourceTypes[0] ?? FALLBACK_DEFAULTS.type };
  }
  return {
    type: initialValues.type,
    name: initialValues.name,
    priority: initialValues.priority,
    enabled: initialValues.enabled,
    syncIntervalHours: initialValues.syncIntervalHours,
    configValues: initialValues.config,
  };
}

function useSourceFormState(initialValues: SourceFormValues | undefined, sourceTypes: string[]) {
  const defaults = buildDefaults(initialValues, sourceTypes);
  const [type, setType] = useState(defaults.type);
  const [name, setName] = useState(defaults.name);
  const [priority, setPriority] = useState(defaults.priority);
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [syncIntervalHours, setSyncIntervalHours] = useState(defaults.syncIntervalHours);
  const [configValues, setConfigValues] = useState(defaults.configValues);
  return {
    type,
    setType,
    name,
    setName,
    priority,
    setPriority,
    enabled,
    setEnabled,
    syncIntervalHours,
    setSyncIntervalHours,
    configValues,
    setConfigValues,
  };
}

function useSourceMutations(onClose: () => void) {
  const queryClient = useQueryClient();
  const invalidateRotation = () =>
    void queryClient.invalidateQueries({ queryKey: ['media', 'rotation'] });

  const createMutation = useMutation({
    mutationFn: async (input: CreateSourceInput) =>
      unwrap(await rotationCreateSource({ body: input })),
    onSuccess: () => {
      toast.success('Source created');
      invalidateRotation();
      onClose();
    },
    onError: () => toast.error('Failed to create source'),
  });
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateSourceInput) =>
      unwrap(
        await rotationUpdateSource({
          path: { id: input.id },
          body: {
            name: input.name,
            priority: input.priority,
            enabled: input.enabled,
            syncIntervalHours: input.syncIntervalHours,
            config: input.config,
          },
        })
      ),
    onSuccess: () => {
      toast.success('Source updated');
      invalidateRotation();
      onClose();
    },
    onError: () => toast.error('Failed to update source'),
  });
  return { createMutation, updateMutation };
}

export function useSourceFormModel({
  mode,
  initialValues,
  sourceTypes,
  onClose,
}: UseSourceFormArgs) {
  const state = useSourceFormState(initialValues, sourceTypes);
  const { createMutation, updateMutation } = useSourceMutations(onClose);
  const plexFriendsQuery = useQuery<PlexFriendsResult>({
    queryKey: ['media', 'rotation', 'listPlexFriends'],
    queryFn: async () => (await unwrap(await rotationListPlexFriends())).data,
    enabled: state.type === 'plex_friends',
  });

  const handleSubmit = () => {
    if (!state.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = {
      name: state.name.trim(),
      priority: state.priority,
      enabled: state.enabled,
      config: state.configValues,
      syncIntervalHours: state.syncIntervalHours,
    };
    if (mode === 'create') {
      createMutation.mutate({ ...payload, type: state.type });
    } else if (initialValues?.id) {
      updateMutation.mutate({ ...payload, id: initialValues.id });
    }
  };

  return {
    ...state,
    handleSubmit,
    isPending: createMutation.isPending || updateMutation.isPending,
    plexFriendsQuery,
  };
}
