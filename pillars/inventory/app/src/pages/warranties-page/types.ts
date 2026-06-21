export interface WarrantyItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  warrantyDocumentId: number | null;
}

export type WarrantyEntry = WarrantyItem & { daysRemaining: number };

export interface TierConfig {
  label: string;
  borderColor: string;
  bgColor: string;
  headerBg: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const TIER_STYLES: Record<string, TierConfig> = {
  critical: {
    label: 'Critical — Under 30 Days',
    borderColor: 'border-destructive/20',
    bgColor: 'bg-destructive/5',
    headerBg: 'bg-destructive/10',
    dotColor: 'bg-destructive/50',
    badgeBg: 'bg-destructive/20',
    badgeText: 'text-destructive',
    badgeBorder: 'border-destructive/30',
  },
  warning: {
    label: 'Warning — 30 to 60 Days',
    borderColor: 'border-warning/20',
    bgColor: 'bg-warning/5',
    headerBg: 'bg-warning/10',
    dotColor: 'bg-warning/50',
    badgeBg: 'bg-warning/20',
    badgeText: 'text-warning',
    badgeBorder: 'border-warning/30',
  },
  caution: {
    label: 'Caution — 60 to 90 Days',
    borderColor: 'border-orange-500/20',
    bgColor: 'bg-orange-500/5',
    headerBg: 'bg-orange-500/10',
    dotColor: 'bg-orange-500',
    badgeBg: 'bg-orange-500/20',
    badgeText: 'text-orange-600 dark:text-orange-400',
    badgeBorder: 'border-orange-500/30',
  },
};
