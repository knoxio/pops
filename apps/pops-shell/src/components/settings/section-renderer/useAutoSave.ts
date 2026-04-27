import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { SettingsField } from '@pops/types';

import type { SaveState } from './types';

interface SetBulkMutation {
  mutate: (
    input: { entries: { key: string; value: string }[] },
    callbacks: { onSuccess: () => void; onError: (err: { message: string }) => void }
  ) => void;
}

interface UseAutoSaveArgs {
  setBulkMutation: SetBulkMutation;
  fieldsByKey: Record<string, SettingsField>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const DEBOUNCE_MS = 500;
const SAVED_VISIBLE_MS = 2000;

interface SaveCallbackArgs {
  setSaveStates: React.Dispatch<React.SetStateAction<Record<string, SaveState>>>;
  saveVersionRefs: React.MutableRefObject<Map<string, number>>;
  savedTimerRefs: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  fieldsByKey: Record<string, SettingsField>;
}

function useSaveCallbacks({
  setSaveStates,
  saveVersionRefs,
  savedTimerRefs,
  fieldsByKey,
}: SaveCallbackArgs) {
  const handleSaveSuccess = useCallback(
    (key: string, version: number) => {
      if (saveVersionRefs.current.get(key) !== version) return;
      const pending = savedTimerRefs.current.get(key);
      if (pending) clearTimeout(pending);
      setSaveStates((prev) => ({ ...prev, [key]: 'saved' }));
      const savedTimer = setTimeout(() => {
        savedTimerRefs.current.delete(key);
        setSaveStates((prev) => (prev[key] === 'saved' ? { ...prev, [key]: 'idle' } : prev));
      }, SAVED_VISIBLE_MS);
      savedTimerRefs.current.set(key, savedTimer);
      if (fieldsByKey[key]?.requiresRestart) {
        toast.info('Setting saved — restart required for this change to take effect');
      }
    },
    [setSaveStates, saveVersionRefs, savedTimerRefs, fieldsByKey]
  );

  const handleSaveError = useCallback(
    (key: string, version: number, err: { message: string }) => {
      if (saveVersionRefs.current.get(key) !== version) return;
      setSaveStates((prev) => ({ ...prev, [key]: 'idle' }));
      toast.error(`Failed to save ${key}: ${err.message}`);
    },
    [setSaveStates, saveVersionRefs]
  );

  return { handleSaveSuccess, handleSaveError };
}

export function useAutoSave({ setBulkMutation, fieldsByKey, setValues }: UseAutoSaveArgs) {
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const debounceRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savedTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveVersionRefs = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const debounceMap = debounceRefs.current;
    const savedTimerMap = savedTimerRefs.current;
    return () => {
      for (const timer of debounceMap.values()) clearTimeout(timer);
      for (const timer of savedTimerMap.values()) clearTimeout(timer);
    };
  }, []);

  const { handleSaveSuccess, handleSaveError } = useSaveCallbacks({
    setSaveStates,
    saveVersionRefs,
    savedTimerRefs,
    fieldsByKey,
  });

  const triggerSave = useCallback(
    (key: string, value: string) => {
      const version = (saveVersionRefs.current.get(key) ?? 0) + 1;
      saveVersionRefs.current.set(key, version);
      setSaveStates((prev) => ({ ...prev, [key]: 'saving' }));
      setBulkMutation.mutate(
        { entries: [{ key, value }] },
        {
          onSuccess: () => handleSaveSuccess(key, version),
          onError: (err) => handleSaveError(key, version, err),
        }
      );
    },
    [setBulkMutation, handleSaveSuccess, handleSaveError]
  );

  const handleChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      const pendingSaved = savedTimerRefs.current.get(key);
      if (pendingSaved) {
        clearTimeout(pendingSaved);
        savedTimerRefs.current.delete(key);
      }
      setSaveStates((prev) => ({ ...prev, [key]: 'idle' }));

      const existing = debounceRefs.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceRefs.current.delete(key);
        triggerSave(key, value);
      }, DEBOUNCE_MS);
      debounceRefs.current.set(key, timer);
    },
    [setValues, triggerSave]
  );

  return { saveStates, handleChange };
}
