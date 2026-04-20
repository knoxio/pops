import { iconMap } from '@/app/nav/icon-map';

import { cn } from '@pops/ui';

import type { SettingsManifest } from '@pops/types';

interface SectionNavProps {
  manifests: SettingsManifest[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SectionNav({ manifests, activeId, onSelect }: SectionNavProps) {
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
    </nav>
  );
}
