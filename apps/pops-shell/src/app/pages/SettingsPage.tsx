import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { trpc } from '@/lib/trpc';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { SectionNav } from './settings-page/SectionNav';
import { SettingsEmpty, SettingsLoading } from './settings-page/SettingsLoading';
import { useSectionObserver } from './settings-page/useSectionObserver';
import { useTestActionHandler } from './settings-page/useTestActionHandler';

import type { SettingsManifest } from '@pops/types';

export function SettingsPage() {
  const { data, isLoading } = trpc.core.settings.getManifests.useQuery();
  const contentRef = useRef<HTMLDivElement>(null);
  const manifests = useMemo(() => (data?.manifests ?? []) as SettingsManifest[], [data?.manifests]);
  const activeId = useSectionObserver(manifests, contentRef);
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
      <aside className="w-48 shrink-0 hidden md:block sticky top-6 self-start">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-3">
          Settings
        </p>
        <SectionNav manifests={manifests} activeId={activeId} onSelect={scrollToSection} />
      </aside>

      <div className="md:hidden w-full mb-4">
        <select
          value={activeId}
          onChange={(e) => scrollToSection(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {manifests.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </div>

      <div ref={contentRef} className="flex-1 space-y-10 min-w-0">
        {manifests.map((manifest) => (
          <section key={manifest.id} id={manifest.id}>
            <h2 className="text-lg font-semibold mb-4">{manifest.title}</h2>
            <SectionRenderer manifest={manifest} onTestAction={handleTestAction} />
          </section>
        ))}
      </div>
    </div>
  );
}
