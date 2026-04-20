import { AssetIdBadge, Badge, formatAUD, formatDate } from '@pops/ui';

import { brandModelLabel, formatDaysRemaining, urgencyBadgeVariant } from './utils';

import type { WarrantyItem } from './types';

function PaperlessLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary whitespace-nowrap hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      View Warranty
    </a>
  );
}

function DaysBadge({
  daysRemaining,
  showUrgency,
}: {
  daysRemaining: number;
  showUrgency: boolean;
}) {
  if (showUrgency) {
    return (
      <Badge variant={urgencyBadgeVariant(daysRemaining)} className="text-xs whitespace-nowrap">
        {formatDaysRemaining(daysRemaining)}
      </Badge>
    );
  }
  if (daysRemaining >= 0) {
    return (
      <Badge variant="outline" className="text-xs whitespace-nowrap text-success border-success/20">
        {formatDaysRemaining(daysRemaining)}
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {Math.abs(daysRemaining)}d ago
    </span>
  );
}

interface WarrantyRowProps {
  item: WarrantyItem;
  daysRemaining: number;
  showUrgency?: boolean;
  paperlessBaseUrl: string | null;
  onClick: () => void;
}

export function WarrantyRow({
  item,
  daysRemaining,
  showUrgency,
  paperlessBaseUrl,
  onClick,
}: WarrantyRowProps) {
  const subtitle = brandModelLabel(item.brand, item.model);
  const docUrl =
    item.warrantyDocumentId != null && paperlessBaseUrl != null
      ? `${paperlessBaseUrl}/documents/${item.warrantyDocumentId}/details`
      : null;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-medium truncate">{item.itemName}</span>
        {subtitle && <span className="text-xs text-muted-foreground truncate">{subtitle}</span>}
      </div>
      {item.assetId && <AssetIdBadge assetId={item.assetId} />}
      {docUrl && <PaperlessLink href={docUrl} />}
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {item.warrantyExpires && formatDate(item.warrantyExpires)}
      </span>
      <DaysBadge daysRemaining={daysRemaining} showUrgency={!!showUrgency} />
      {item.replacementValue != null && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatAUD(item.replacementValue)}
        </span>
      )}
    </button>
  );
}
