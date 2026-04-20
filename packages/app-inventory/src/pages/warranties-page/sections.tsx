import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button } from '@pops/ui';

import { TIER_STYLES } from './types';
import { WarrantyRow } from './WarrantyRow';

import type { WarrantyEntry } from './types';

interface ExpiringSectionProps {
  tier: keyof typeof TIER_STYLES;
  items: WarrantyEntry[];
  paperlessBaseUrl: string | null;
  onItemClick: (id: string) => void;
}

export function ExpiringSection({
  tier,
  items,
  paperlessBaseUrl,
  onItemClick,
}: ExpiringSectionProps) {
  if (items.length === 0) return null;
  const style = TIER_STYLES[tier];
  if (!style) return null;

  return (
    <div
      className={`border-2 ${style.borderColor} rounded-2xl ${style.bgColor} overflow-hidden shadow-sm`}
    >
      <div
        className={`flex items-center gap-2 px-5 py-4 font-bold text-foreground ${style.headerBg}`}
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${style.dotColor} animate-pulse`} />
          {style.label}
        </span>
        <Badge className={`${style.badgeBg} ${style.badgeText} ${style.badgeBorder} ml-auto`}>
          {items.length}
        </Badge>
      </div>
      <div className="px-3 pb-3">
        {items.map((item) => (
          <WarrantyRow
            key={item.id}
            item={item}
            daysRemaining={item.daysRemaining}
            showUrgency
            paperlessBaseUrl={paperlessBaseUrl}
            onClick={() => onItemClick(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <Button
        variant="ghost"
        className="flex w-full items-center gap-2 px-4 py-3 h-auto text-left font-medium"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        {title}
        <Badge variant="secondary" className="text-xs ml-1">
          {count}
        </Badge>
      </Button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}
