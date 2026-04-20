import { useEffect, useState } from 'react';

import type { SettingsManifest } from '@pops/types';

interface UseSettingsValuesArgs {
  data: { settings: Record<string, string> } | undefined;
  manifest: SettingsManifest;
}

export function useSettingsValues({ data, manifest }: UseSettingsValuesArgs) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadedKeys, setLoadedKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data?.settings) return;
    setLoadedKeys(data.settings);
    const withDefaults: Record<string, string> = { ...data.settings };
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (!(field.key in withDefaults) && field.default !== undefined) {
          withDefaults[field.key] = field.default;
        }
      }
    }
    setValues(withDefaults);
  }, [data?.settings, manifest]);

  return { values, setValues, loadedKeys };
}
