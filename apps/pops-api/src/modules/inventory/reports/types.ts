/**
 * Inventory reports — dashboard summary and breakdown types.
 */

export interface DashboardSummary {
  itemCount: number;
  totalReplacementValue: number;
  totalResaleValue: number;
  warrantiesExpiringSoon: number;
  recentlyAdded: RecentItem[];
}

export interface RecentItem {
  id: string;
  itemName: string;
  type: string | null;
  assetId: string | null;
  lastEditedTime: string;
}

export interface ValueBreakdownEntry {
  name: string;
  totalValue: number;
  itemCount: number;
}
