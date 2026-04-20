import { z } from 'zod';

export interface Entity {
  id: string;
  name: string;
  type: string | null;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  transactionCount?: number;
}

export const ENTITY_TYPES = ['company', 'person', 'place', 'brand', 'organisation'] as const;

export const TRANSACTION_TYPES = [
  { label: 'None', value: '' },
  { label: 'Purchase', value: 'purchase' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Income', value: 'income' },
];

export const EntityFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string(),
  abn: z.string(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string(),
  defaultTags: z.array(z.string()),
  notes: z.string(),
});

export type EntityFormValues = z.infer<typeof EntityFormSchema>;

export const DEFAULT_FORM_VALUES: EntityFormValues = {
  name: '',
  type: 'company',
  abn: '',
  aliases: [],
  defaultTransactionType: '',
  defaultTags: [],
  notes: '',
};
