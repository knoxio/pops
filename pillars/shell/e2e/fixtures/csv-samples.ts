/**
 * CSV samples for import wizard E2E tests
 *
 * Various CSV formats to test different scenarios
 */

/**
 * Simple CSV: 2 transactions
 */
export const simpleCSV = `Date,Description,Amount
13/02/2026,WOOLWORTHS 1234,125.50
14/02/2026,UNKNOWN MERCHANT,50.00`;

/**
 * Realistic CSV: 12 transactions with mixed results
 */
export const realisticCSV = `Date,Description,Amount,Account
10/02/2026,WOOLWORTHS 1234,125.50,Amex
11/02/2026,COLES 5678,87.25,Amex
12/02/2026,NETFLIX.COM,19.99,Amex
13/02/2026,UNKNOWN CAFE BONDI,15.50,Amex
13/02/2026,UNKNOWN CAFE MANLY,16.00,Amex
14/02/2026,UNKNOWN CAFE SURRY HILLS,14.75,Amex
14/02/2026,UNKNOWN CAFE CBD,15.00,Amex
15/02/2026,MYSTERY STORE XYZ,99.99,Amex
15/02/2026,ACME CORP,250.00,Amex
16/02/2026,RANDOM MERCHANT 123,45.00,Amex
16/02/2026,UNRECOGNIZED PAYEE,33.50,Amex
10/02/2026,WOOLWORTHS 1234,125.50,Amex`;

/**
 * Bulk CSV: Many similar transactions (for bulk operations testing)
 */
export const bulkCSV = `Date,Description,Amount,Account,Location
10/02/2026,WOOLWORTHS 1234,125.50,Amex,North Sydney
11/02/2026,UNKNOWN CAFE BONDI,15.50,Amex,Bondi
11/02/2026,UNKNOWN CAFE MANLY,16.00,Amex,Manly
12/02/2026,UNKNOWN CAFE SURRY HILLS,14.75,Amex,Surry Hills
12/02/2026,UNKNOWN CAFE CBD,15.00,Amex,Sydney
13/02/2026,UNKNOWN CAFE PARRAMATTA,14.50,Amex,Parramatta
13/02/2026,UNKNOWN CAFE NEWTOWN,15.25,Amex,Newtown`;

/**
 * Duplicates CSV: Testing duplicate detection
 */
export const duplicatesCSV = `Date,Description,Amount,Account
10/02/2026,WOOLWORTHS 1234,125.50,Amex
11/02/2026,COLES 5678,87.25,Amex
10/02/2026,WOOLWORTHS 1234,125.50,Amex
10/02/2026,COLES 5678,87.25,Amex
11/02/2026,NETFLIX.COM,19.99,Amex`;

/**
 * Large CSV: 150 transactions for stress testing
 */
export const generateLargeCSV = (count: number = 150): string => {
  const lines = ['Date,Description,Amount,Account'];

  const merchants = [
    'WOOLWORTHS',
    'COLES',
    'NETFLIX.COM',
    'SPOTIFY',
    'AMAZON',
    'UBER',
    'SHELL',
    'BP',
    "MCDONALD'S",
    'KFC',
  ];

  for (let i = 0; i < count; i++) {
    const day = 10 + (i % 20);
    const date = `${day.toString().padStart(2, '0')}/02/2026`;
    const merchant = merchants[i % merchants.length];
    const amount = (Math.random() * 200 + 10).toFixed(2);
    lines.push(`${date},${merchant} ${i + 1},${amount},Amex`);
  }

  return lines.join('\n');
};

/**
 * Invalid CSV: Wrong format (for error testing)
 */
export const invalidCSV = `This is not a CSV file
Just some random text
No proper structure`;

/**
 * Empty CSV: No data rows
 */
export const emptyCSV = `Date,Description,Amount`;

/**
 * Missing columns CSV: Missing required fields
 */
export const missingColumnsCSV = `Date,Description
13/02/2026,WOOLWORTHS 1234`;

/**
 * Helper function to create CSV buffer for file upload
 */
export const createCSVBuffer = (content: string): Buffer => {
  return Buffer.from(content);
};
