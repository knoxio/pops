import { formatDate } from '@pops/ui';

export interface WarrantyStatus {
  label: string;
  variant: 'default' | 'destructive' | 'secondary';
}

export function warrantyStatus(expiryStr: string | null): WarrantyStatus {
  if (!expiryStr) return { label: 'None', variant: 'secondary' };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryStr);
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'Expired', variant: 'destructive' };
  if (days <= 90) return { label: `${days}d left`, variant: 'default' };
  return { label: formatDate(expiryStr), variant: 'secondary' };
}
