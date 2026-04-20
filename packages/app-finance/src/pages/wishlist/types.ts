import { z } from 'zod';

export const WishlistItemSchema = z.object({
  item: z.string().min(1, 'Item name is required'),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(['Needing', 'Soon', 'One Day', 'Dreaming']).nullable().optional(),
  url: z.string().url('Must be a valid URL').or(z.literal('')).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type WishlistFormValues = z.infer<typeof WishlistItemSchema>;

export interface WishlistItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  remainingAmount: number | null;
  priority: string | null;
  url: string | null;
  notes: string | null;
  lastEditedTime: string;
}

export const DEFAULT_WISHLIST_VALUES: WishlistFormValues = {
  item: '',
  targetAmount: null,
  saved: null,
  priority: 'Soon',
  url: '',
  notes: '',
};

export const PRIORITY_OPTIONS = [
  { label: 'Needing', value: 'Needing' },
  { label: 'Soon', value: 'Soon' },
  { label: 'One Day', value: 'One Day' },
  { label: 'Dreaming', value: 'Dreaming' },
];
