import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Select, Skeleton } from '@pops/ui';

import { SectionNav } from './settings-page/SectionNav';
import { SettingsEmpty } from './settings-page/SettingsLoading';
import { useHashSelectedId } from './settings-page/useHashSelectedId';
import { useSettingsSections, type SettingsSection } from './settings-page/useSettingsSections';
import { useTestActionHandler } from './settings-page/useTestActionHandler';

function ManifestPanel({
  section,
  onTestAction,
}: {
  section: SettingsSection;
  onTestAction: (procedure: string) => Promise<void>;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold mb-4">{section.manifest.title}</h2>
      <SectionRenderer
        manifest={section.manifest}
        ownerPillar={section.ownerPillar}
        hasFederatedSettings={section.hasFederatedSettings}
        onTestAction={onTestAction}
      />
    </>
  );
}

function SettingsLoadingSidebar() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 hidden md:flex flex-col border-r border-border/50 p-4 gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </aside>
      <div className="flex-1 p-6 space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

/**
 * The admin Settings page (settings-federation S3). Sections come from the
 * LIVE registry (`discoverSettings` over the snapshot) rather than the
 * build-time `MODULES` projection, and each section's read/write routes to its
 * OWNING pillar (capability-gated) via `SectionRenderer`.
 */
export function SettingsPage() {
  const { t } = useTranslation('shell');
  const handleTestAction = useTestActionHandler();

  const { data: sections, isLoading } = useSettingsSections();
  const manifests = useMemo(() => (sections ?? []).map((section) => section.manifest), [sections]);
  const [selectedId, setSelectedId] = useHashSelectedId(manifests);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      window.history.replaceState(null, '', `#${id}`);
    },
    [setSelectedId]
  );

  const selectedSection = useMemo(
    () =>
      (sections ?? []).find((section) => section.manifest.id === selectedId) ?? (sections ?? [])[0],
    [sections, selectedId]
  );

  if (isLoading) return <SettingsLoadingSidebar />;
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
        {selectedSection && (
          <div className="flex-1 overflow-y-auto p-6">
            <ManifestPanel section={selectedSection} onTestAction={handleTestAction} />
          </div>
        )}
      </div>

      {/* Desktop: right content pane */}
      {selectedSection && (
        <div className="hidden md:block flex-1 overflow-y-auto p-6 min-w-0">
          <ManifestPanel section={selectedSection} onTestAction={handleTestAction} />
        </div>
      )}
    </div>
  );
}
