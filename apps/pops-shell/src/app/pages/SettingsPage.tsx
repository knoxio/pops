import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MODULES } from '@pops/module-registry';
import { Select } from '@pops/ui';

import { SectionNav } from './settings-page/SectionNav';
import { SettingsEmpty } from './settings-page/SettingsLoading';
import { useHashSelectedId } from './settings-page/useHashSelectedId';
import { useTestActionHandler } from './settings-page/useTestActionHandler';

import type { SettingsManifest } from '@pops/types';

function ManifestPanel({
  manifest,
  onTestAction,
}: {
  manifest: SettingsManifest;
  onTestAction: (procedure: string) => Promise<void>;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold mb-4">{manifest.title}</h2>
      <SectionRenderer manifest={manifest} onTestAction={onTestAction} />
    </>
  );
}

/**
 * Aggregate every installed module's settings sections (PRD-101 US-04 follow-up).
 * `MODULES` is the build-time install set — sections from absent modules are
 * elided at compile time, not filtered at runtime. The per-module narrow
 * tuple types are widened back to `SettingsManifest` via the inner-callback
 * return annotation so the sort comparator gets the contract type.
 */
function getManifests(): SettingsManifest[] {
  return MODULES.flatMap((m): readonly SettingsManifest[] =>
    'settings' in m && m.settings !== undefined ? m.settings : []
  ).toSorted((a, b) => a.order - b.order);
}

export function SettingsPage() {
  const { t } = useTranslation('shell');
  const handleTestAction = useTestActionHandler();

  const manifests = useMemo(() => getManifests(), []);
  const [selectedId, setSelectedId] = useHashSelectedId(manifests);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      window.history.replaceState(null, '', `#${id}`);
    },
    [setSelectedId]
  );

  const selectedManifest = useMemo(
    () => manifests.find((m) => m.id === selectedId) ?? manifests[0],
    [manifests, selectedId]
  );

  if (!manifests.length) return <SettingsEmpty />;

  return (
    <div className="flex h-full min-h-0">
      {/* Sticky left sidebar — desktop only */}
      <aside className="w-60 shrink-0 hidden md:flex flex-col border-r border-border/50">
        <div className="p-4 border-b border-border/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings')}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <SectionNav manifests={manifests} activeId={selectedId} onSelect={handleSelect} />
        </div>
      </aside>

      {/* Mobile: dropdown + content */}
      <div className="md:hidden w-full flex flex-col min-h-0">
        <div className="p-4 border-b border-border/50 shrink-0">
          <Select
            aria-label={t('settingsSection')}
            value={selectedId || (manifests[0]?.id ?? '')}
            onChange={(e) => handleSelect(e.target.value)}
            options={manifests.map((m) => ({ value: m.id, label: m.title }))}
          />
        </div>
        {selectedManifest && (
          <div className="flex-1 overflow-y-auto p-6">
            <ManifestPanel manifest={selectedManifest} onTestAction={handleTestAction} />
          </div>
        )}
      </div>

      {/* Desktop: right content pane */}
      {selectedManifest && (
        <div className="hidden md:block flex-1 overflow-y-auto p-6 min-w-0">
          <ManifestPanel manifest={selectedManifest} onTestAction={handleTestAction} />
        </div>
      )}
    </div>
  );
}
