import { iconMap } from '@/app/nav/icon-map';

import { cn } from '@pops/ui';

import type { SettingsManifest } from '@pops/types';

interface SectionNavProps {
  manifests: SettingsManifest[];
  activeId: string;
  onSelect: (id: string) => void;
}

interface ManifestGroup {
  label: string;
  items: SettingsManifest[];
}

/**
 * Derive a human-readable group label from a manifest ID.
 * IDs use dot-notation: 'media.plex' -> 'Media', 'core.operational' -> 'Core'.
 * IDs without a dot (e.g. 'finance', 'inventory') stand alone as their own group.
 */
function getGroupKey(id: string): string {
  const dot = id.indexOf('.');
  return dot !== -1 ? id.slice(0, dot) : id;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupManifests(manifests: SettingsManifest[]): ManifestGroup[] {
  const groupMap = new Map<string, SettingsManifest[]>();

  for (const m of manifests) {
    const key = getGroupKey(m.id);
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(m);
    } else {
      groupMap.set(key, [m]);
    }
  }

  return Array.from(groupMap.entries()).map(([key, items]) => ({
    label: capitalize(key),
    items,
  }));
}

export function SectionNav({ manifests, activeId, onSelect }: SectionNavProps) {
  const groups = groupManifests(manifests);
  const multiGroup = groups.length > 1;

  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          {multiGroup && (
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((m) => {
              const Icon = m.icon ? iconMap[m.icon as keyof typeof iconMap] : null;
              const isActive = activeId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-left group',
                    isActive
                      ? 'bg-app-accent text-app-accent-foreground shadow-sm'
                      : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-app-accent-foreground'
                          : 'text-app-accent/70 group-hover:text-foreground'
                      )}
                    />
                  )}
                  <span>{m.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
