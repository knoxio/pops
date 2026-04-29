import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { trpc } from '@/lib/trpc';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

import { SectionNav } from './settings-page/SectionNav';
import { SettingsEmpty, SettingsLoading } from './settings-page/SettingsLoading';
import { useTestActionHandler } from './settings-page/useTestActionHandler';

import type { SettingsManifest } from '@pops/types';

export function SettingsPage() {
  const { t } = useTranslation('shell');
  const { data, isLoading } = trpc.core.settings.getManifests.useQuery();
  const manifests = useMemo(() => (data?.manifests ?? []) as SettingsManifest[], [data?.manifests]);
  const handleTestAction = useTestActionHandler();

  // Derive the initial selection from the URL hash, falling back to the first manifest.
  const [selectedId, setSelectedId] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    return hash || '';
  });

  // Once manifests load, resolve the selection: use the hash if it matches a
  // manifest id, otherwise default to the first manifest.
  useEffect(() => {
    if (!manifests.length) return;
    const hash = window.location.hash.slice(1);
    const hasValidHash = hash !== '' && manifests.some((m) => m.id === hash);
    setSelectedId(hasValidHash ? hash : (manifests[0]?.id ?? ''));
  }, [manifests]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, '', `#${id}`);
  }, []);

  const selectedManifest = useMemo(
    () => manifests.find((m) => m.id === selectedId) ?? manifests[0],
    [manifests, selectedId]
  );

  if (isLoading) return <SettingsLoading />;
  if (!manifests.length) return <SettingsEmpty />;

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail — hidden on mobile */}
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

      {/* Mobile: dropdown at top */}
      <div className="md:hidden w-full">
        <div className="p-4 border-b border-border/50">
          <Select
            aria-label={t('settingsSection')}
            value={selectedId || (manifests[0]?.id ?? '')}
            onChange={(e) => handleSelect(e.target.value)}
            options={manifests.map((m) => ({ value: m.id, label: m.title }))}
          />
        </div>
        {selectedManifest && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">{selectedManifest.title}</h2>
            <SectionRenderer manifest={selectedManifest} onTestAction={handleTestAction} />
          </div>
        )}
      </div>

      {/* Right pane — desktop only */}
      {selectedManifest && (
        <div className="hidden md:block flex-1 overflow-y-auto p-6 min-w-0">
          <h2 className="text-lg font-semibold mb-4">{selectedManifest.title}</h2>
          <SectionRenderer manifest={selectedManifest} onTestAction={handleTestAction} />
        </div>
      )}
    </div>
  );
}
