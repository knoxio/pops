export interface Dimension {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  weight: number;
}

/** Inline edit state for a single dimension. */
export interface EditState {
  id: number;
  name: string;
  description: string;
}
