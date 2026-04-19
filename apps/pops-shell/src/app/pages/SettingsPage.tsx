import { iconMap } from '@/app/nav/icon-map';
import { SectionRenderer } from '@/components/settings/SectionRenderer';
import { trpc } from '@/lib/trpc';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Skeleton, cn } from '@pops/ui';

import type { SettingsManifest } from '@pops/types';

function useSectionObserver(
  manifests: SettingsManifest[],
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  const [activeId, setActiveId] = useState<string>('');

  // Default to first manifest when data loads and no section is active yet
  useEffect(() => {
    if (manifests.length > 0 && !activeId) {
      const hash = window.location.hash.slice(1);
      setActiveId(hash && manifests.some((m) => m.id === hash) ? hash : (manifests[0]?.id ?? ''));
    }
  }, [manifests, activeId]);

  useEffect(() => {
    if (!manifests.length || !contentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { root: null, rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    for (const m of manifests) {
      const el = document.getElementById(m.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [manifests, contentRef]);

  return activeId;
}

function SectionNav({
  manifests,
  activeId,
  onSelect,
}: {
  manifests: SettingsManifest[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {manifests.map((m) => {
        const Icon = m.icon ? iconMap[m.icon as keyof typeof iconMap] : null;
        const isActive = activeId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
              isActive
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span>{m.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsPage() {
  const { data, isLoading } = trpc.core.settings.getManifests.useQuery();
  const utils = trpc.useUtils();
  const contentRef = useRef<HTMLDivElement>(null);
  const manifests = useMemo(() => (data?.manifests ?? []) as SettingsManifest[], [data?.manifests]);
  const activeId = useSectionObserver(manifests, contentRef);

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

  // Build a test-action handler that calls tRPC procedures dynamically
  const handleTestAction = useCallback(
    async (procedure: string) => {
      const parts = procedure.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = utils.client;
      for (const part of parts) {
        current = current[part];
        if (!current) throw new Error(`Unknown procedure: ${procedure}`);
      }
      // tRPC procedures can be queries or mutations
      if (typeof current.query === 'function') {
        await current.query();
      } else if (typeof current.mutate === 'function') {
        await current.mutate({});
      } else {
        throw new Error(`Cannot call procedure: ${procedure}`);
      }
    },
    [utils]
  );

  if (isLoading) {
    return (
      <div className="flex gap-8 p-6 max-w-5xl mx-auto">
        <div className="w-48 shrink-0 space-y-2">
          {['s1', 's2', 's3', 's4'].map((id) => (
            <Skeleton key={id} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!manifests.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No settings registered
      </div>
    );
  }

  return (
    <div className="flex gap-8 p-6 max-w-5xl mx-auto">
      {/* Sidebar — hidden on mobile */}
      <aside className="w-48 shrink-0 hidden md:block sticky top-6 self-start">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-3">
          Settings
        </p>
        <SectionNav manifests={manifests} activeId={activeId} onSelect={scrollToSection} />
      </aside>

      {/* Mobile dropdown */}
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

      {/* Content */}
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
