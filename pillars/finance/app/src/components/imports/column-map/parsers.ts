export function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseAmount(amountStr: string | undefined): number | null {
  if (!amountStr) return null;
  const cleaned = amountStr.replaceAll(/[^0-9.-]/g, '');
  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return null;
  return -amount;
}

export function extractLocation(townCity: string): string | undefined {
  if (!townCity) return undefined;
  const lines = townCity.split('\n');
  const town = lines[0]?.trim();
  if (!town) return undefined;
  return town
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface ColumnMap {
  date: string;
  description: string;
  amount: string;
  location?: string;
}

export function autoDetectColumns(headers: string[]): ColumnMap {
  const findMatch = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const match = headers.find((h) => h.toLowerCase().includes(pattern));
      if (match) return match;
    }
    return '';
  };
  return {
    date: findMatch(['date', 'transaction date', 'posting date']),
    description: findMatch(['description', 'merchant', 'payee']),
    amount: findMatch(['amount', 'debit', 'credit', 'value']),
    location: findMatch(['town', 'city', 'town/city', 'location']) || undefined,
  };
}
