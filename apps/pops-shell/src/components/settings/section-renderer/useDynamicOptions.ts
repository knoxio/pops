import { useEffect, useState } from 'react';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

export function useDynamicOptions(optionsLoaders?: Loaders) {
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Options>>({});
  const [loadingOptionKeys, setLoadingOptionKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!optionsLoaders) return;
    let cancelled = false;
    const keysStarted = new Set<string>();

    for (const [key, loader] of Object.entries(optionsLoaders)) {
      keysStarted.add(key);
      setLoadingOptionKeys((prev) => new Set([...prev, key]));
      Promise.resolve()
        .then(loader)
        .then((opts) => {
          if (!cancelled) setDynamicOptions((prev) => ({ ...prev, [key]: opts }));
        })
        .catch(() => {
          /* fall back to static options */
        })
        .finally(() => {
          if (cancelled) return;
          setLoadingOptionKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        });
    }

    return () => {
      cancelled = true;
      setLoadingOptionKeys((prev) => {
        const next = new Set(prev);
        for (const key of keysStarted) next.delete(key);
        return next;
      });
    };
  }, [optionsLoaders]);

  return { dynamicOptions, loadingOptionKeys };
}
