import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { trpc } from '@/lib/trpc';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

import { SectionNav } from './settings-page/SectionNav';
import { SettingsEmpty, SettingsLoading } from './settings-page/SettingsLoading';
import { useSectionObserver } from './settings-page/useSectionObserver';
import { useTestActionHandler } from './settings-page/useTestActionHandler';

import type { SettingsManifest } from '@pops/types';

export function SettingsPage() {
  const { t } = useTranslation('shell');
  const { data, isLoading } = trpc.core.settings.getManifests.useQuery();
  const manifests = useMemo(() => (data?.manifests ?? []) as SettingsManifest[], [data?.manifests]);
  const activeId = useSectionObserver(manifests);
  const handleTestAction = useTestActionHandler();

  // Handle hash-based deep linking on load
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [manifests]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      window.history.replaceState(null, '', `#${id}`);
    }
  }, []);

  if (isLoading) return <SettingsLoading />;
  if (!manifests.length) return <SettingsEmpty />;

  return (
    <div className="flex gap-8 p-6 max-w-5xl mx-auto">
      {/* Sidebar — hidden on mobile; top-20 clears the fixed TopBar (h-16 = 4rem) */}
      <aside className="w-48 shrink-0 hidden md:block sticky top-20 self-start max-h-[calc(100vh-5rem)] overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-3">
          {t('settings')}
        </p>
        <SectionNav manifests={manifests} activeId={activeId} onSelect={scrollToSection} />
      </aside>

      <div className="md:hidden w-full mb-4">
        <Select
          aria-label={t('settingsSection')}
          value={activeId || (manifests[0]?.id ?? '')}
          onChange={(e) => scrollToSection(e.target.value)}
          options={manifests.map((m) => ({ value: m.id, label: m.title }))}
        />
      </div>

      <div className="flex-1 space-y-10 min-w-0">
        {manifests.map((manifest) => (
          <section key={manifest.id} id={manifest.id} className="scroll-mt-14 md:scroll-mt-20">
            <h2 className="text-lg font-semibold mb-4">{manifest.title}</h2>
            <SectionRenderer manifest={manifest} onTestAction={handleTestAction} />
          </section>
        ))}
      </div>
    </div>
  );
}
