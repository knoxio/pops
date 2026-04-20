import { z } from 'zod';

export interface Budget {
  id: string;
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
  lastEditedTime: string;
}

export const BudgetFormSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  period: z.string(),
  amount: z.string(),
  active: z.boolean(),
  notes: z.string(),
});

export type BudgetFormValues = z.infer<typeof BudgetFormSchema>;

export const PERIOD_OPTIONS = [
  { label: 'None (One-time)', value: '' },
  { label: 'Monthly', value: 'Monthly' },
  { label: 'Yearly', value: 'Yearly' },
];

export const DEFAULT_FORM_VALUES: BudgetFormValues = {
  category: '',
  period: '',
  amount: '',
  active: false,
  notes: '',
};
