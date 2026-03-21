/**
 * Inventory reports — dashboard summary and insurance report types.
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

/** A single item row in the insurance report. */
export interface InsuranceReportItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  warrantyStatus: "active" | "expired" | "none";
  replacementValue: number | null;
  resaleValue: number | null;
  photoPath: string | null;
}

/** Items grouped by location for the insurance report. */
export interface InsuranceReportLocationGroup {
  locationId: string | null;
  locationName: string;
  items: InsuranceReportItem[];
  totalReplacementValue: number;
  totalResaleValue: number;
}

/** Full insurance report response. */
export interface InsuranceReport {
  locations: InsuranceReportLocationGroup[];
  totals: {
    itemCount: number;
    replacementValue: number;
    resaleValue: number;
  };
}
