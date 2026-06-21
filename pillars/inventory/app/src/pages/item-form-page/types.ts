export interface PendingConnection {
  id: string;
  itemName: string;
}

export interface ItemFormValues {
  itemName: string;
  brand: string;
  model: string;
  itemId: string;
  type: string;
  condition: string;
  locationId: string;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string;
  warrantyExpires: string;
  purchasePrice: string;
  replacementValue: string;
  resaleValue: string;
  assetId: string;
  notes: string;
}

export const defaultValues: ItemFormValues = {
  itemName: '',
  brand: '',
  model: '',
  itemId: '',
  type: '',
  condition: 'Good',
  locationId: '',
  inUse: false,
  deductible: false,
  purchaseDate: '',
  warrantyExpires: '',
  purchasePrice: '',
  replacementValue: '',
  resaleValue: '',
  assetId: '',
  notes: '',
};

export function extractPrefix(type: string): string {
  const firstWord = type.split(/\s+/)[0] ?? '';
  const upper = firstWord.toUpperCase();
  return upper.length <= 6 ? upper : upper.slice(0, 4);
}
