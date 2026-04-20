import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { SourceFormValues } from './types';

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
  const utils = trpc.useUtils();
  const createMutation = trpc.media.rotation.createSource.useMutation({
    onSuccess: () => {
      toast.success('Source created');
      void utils.media.rotation.listSources.invalidate();
      onClose();
    },
    onError: () => toast.error('Failed to create source'),
  });
  const updateMutation = trpc.media.rotation.updateSource.useMutation({
    onSuccess: () => {
      toast.success('Source updated');
      void utils.media.rotation.listSources.invalidate();
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
  const plexFriendsQuery = trpc.media.rotation.listPlexFriends.useQuery(undefined, {
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
