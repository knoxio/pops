/**
 * React context for the resolved boot install set (P7-T03 / RD-3).
 *
 * `main.tsx` resolves the registry snapshot into a {@link BootRegistry} before
 * first render (the async boot boundary) and seeds this provider. The nav
 * consumers (`AppRail`, `Sidebar`, `PageNav`, `RootLayout`, `IndexRedirect`)
 * read `registeredApps` from here via {@link useRegisteredApps} instead of the
 * old module-eval `registeredApps` constant, so the rail reflects the live
 * install set (or the static floor when the registry is unreachable).
 *
 * Sibling to `PillarStatusProvider`: that one feeds health post-mount; this one
 * feeds the boot-resolved install set, threaded down from the boot await.
 */
import { createContext, useContext } from 'react';

import type { BootRegistry } from './boot-snapshot';
import type { AppNavConfig } from './nav/types';

const BootRegistryContext = createContext<BootRegistry | null>(null);

export { BootRegistryContext };

interface BootRegistryProviderProps {
  readonly value: BootRegistry;
  readonly children: React.ReactNode;
}

/** Provider seeded by `main.tsx` with the boot-resolved install set. */
export function BootRegistryProvider({
  value,
  children,
}: BootRegistryProviderProps): React.ReactElement {
  return <BootRegistryContext.Provider value={value}>{children}</BootRegistryContext.Provider>;
}

/**
 * Read the resolved boot install set. Throws if used outside the provider —
 * the shell always mounts it at the root, so a missing provider is a wiring
 * bug, not a runtime condition to tolerate.
 */
export function useBootRegistry(): BootRegistry {
  const value = useContext(BootRegistryContext);
  if (value === null) {
    throw new Error('useBootRegistry must be used within a BootRegistryProvider');
  }
  return value;
}

/** The boot-resolved app-rail nav configs. */
export function useRegisteredApps(): readonly AppNavConfig[] {
  return useBootRegistry().registeredApps;
}
