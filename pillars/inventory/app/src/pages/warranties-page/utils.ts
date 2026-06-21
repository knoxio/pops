import type { WarrantyEntry, WarrantyItem } from './types';

export function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dateMatch) return Number.NaN;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return Number.NaN;
  }
  const target = new Date(year, month - 1, day);
  if (
    target.getFullYear() !== year ||
    target.getMonth() !== month - 1 ||
    target.getDate() !== day
  ) {
    return Number.NaN;
  }
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function urgencyBadgeVariant(days: number): 'destructive' | 'secondary' | 'outline' {
  if (days <= 14) return 'destructive';
  if (days <= 30) return 'secondary';
  return 'outline';
}

export function formatDaysRemaining(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function brandModelLabel(brand: string | null, model: string | null): string | null {
  if (brand && model) return `${brand} ${model}`;
  return brand ?? model ?? null;
}

export interface WarrantyTiers {
  critical: WarrantyEntry[];
  warning: WarrantyEntry[];
  caution: WarrantyEntry[];
  active: WarrantyEntry[];
  expired: WarrantyEntry[];
}

export function categorizeWarranties(items: WarrantyItem[]): WarrantyTiers {
  const tiers: WarrantyTiers = {
    critical: [],
    warning: [],
    caution: [],
    active: [],
    expired: [],
  };

  for (const item of items) {
    if (!item.warrantyExpires) continue;
    const days = daysUntil(item.warrantyExpires);
    if (!Number.isFinite(days)) continue;
    const entry: WarrantyEntry = { ...item, daysRemaining: days };
    if (days < 0) tiers.expired.push(entry);
    else if (days < 30) tiers.critical.push(entry);
    else if (days < 60) tiers.warning.push(entry);
    else if (days <= 90) tiers.caution.push(entry);
    else tiers.active.push(entry);
  }

  tiers.critical.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.warning.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.caution.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.active.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.expired.sort((a, b) => b.daysRemaining - a.daysRemaining);
  return tiers;
}
