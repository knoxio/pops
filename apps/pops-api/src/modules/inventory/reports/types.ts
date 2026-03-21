/**
 * Inventory reports — dashboard summary types.
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
  lastEditedTime: string;
}
