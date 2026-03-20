/** Query parameters for transaction listing */
export interface TransactionQuery {
  account?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  entityId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Transaction row returned by the API */
export interface Transaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  categories: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  online: boolean;
  novatedLease: boolean;
  taxReturn: boolean;
}

/** Budget summary row */
export interface BudgetSummary {
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
  period: string;
}

/** Wish list item */
export interface WishlistItem {
  id: string;
  item: string;
  targetAmount: number;
  saved: number;
  priority: string;
}
