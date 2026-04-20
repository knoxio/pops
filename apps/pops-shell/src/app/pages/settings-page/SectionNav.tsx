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
