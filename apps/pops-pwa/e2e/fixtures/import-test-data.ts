/**
 * Reusable mock data for import wizard E2E tests
 *
 * Different scenarios:
 * - simple: Basic 1 matched, 1 uncertain (existing default)
 * - realistic: Multi-scenario data with matched, uncertain, failed, skipped
 * - bulk: Multiple similar transactions for testing bulk operations
 * - errors: Various error scenarios
 */

export type MockScenario = 'simple' | 'realistic' | 'bulk' | 'errors' | 'progress' | 'duplicates';

interface MockTransaction {
  date: string;
  description: string;
  amount: number;
  account: string;
  location?: string;
  online?: boolean;
  rawRow: string;
  checksum: string;
  entity?: {
    entityId?: string;
    entityName: string;
    matchType: 'exact' | 'prefix' | 'contains' | 'ai' | 'none';
    confidence?: number;
  };
  status: 'matched' | 'uncertain' | 'failed' | 'skipped';
  skipReason?: string;
}

interface MockImportResult {
  matched: MockTransaction[];
  uncertain: MockTransaction[];
  failed: MockTransaction[];
  skipped: MockTransaction[];
  warnings?: Array<{
    code: string;
    message: string;
    affectedCount?: number;
  }>;
}

/**
 * Simple scenario: 1 matched, 1 uncertain (original default)
 */
export const createSimpleMockData = (): MockImportResult => ({
  matched: [
    {
      date: '2026-02-13',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      location: 'North Sydney',
      online: false,
      rawRow: '{}',
      checksum: 'abc123',
      entity: {
        entityId: 'woolworths-id',
        entityName: 'Woolworths',
        matchType: 'prefix',
      },
      status: 'matched',
    },
  ],
  uncertain: [
    {
      date: '2026-02-14',
      description: 'UNKNOWN MERCHANT',
      amount: -50.00,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'xyz789',
      entity: {
        entityName: 'Unknown Merchant',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
  ],
  failed: [],
  skipped: [],
});

/**
 * Realistic scenario: Multiple merchants, AI suggestions, mixed results
 */
export const createRealisticMockData = (): MockImportResult => ({
  matched: [
    {
      date: '2026-02-10',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      location: 'North Sydney',
      online: false,
      rawRow: '{}',
      checksum: 'abc123',
      entity: {
        entityId: 'woolworths-id',
        entityName: 'Woolworths',
        matchType: 'prefix',
      },
      status: 'matched',
    },
    {
      date: '2026-02-11',
      description: 'COLES 5678',
      amount: -87.25,
      account: 'Amex',
      location: 'Chatswood',
      online: false,
      rawRow: '{}',
      checksum: 'abc124',
      entity: {
        entityId: 'coles-id',
        entityName: 'Coles',
        matchType: 'prefix',
      },
      status: 'matched',
    },
    {
      date: '2026-02-12',
      description: 'NETFLIX.COM',
      amount: -19.99,
      account: 'Amex',
      online: true,
      rawRow: '{}',
      checksum: 'abc125',
      entity: {
        entityId: 'netflix-id',
        entityName: 'Netflix',
        matchType: 'contains',
      },
      status: 'matched',
    },
  ],
  uncertain: [
    {
      date: '2026-02-13',
      description: 'UNKNOWN CAFE 001',
      amount: -15.50,
      account: 'Amex',
      location: 'Bondi',
      rawRow: '{}',
      checksum: 'unc001',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-13',
      description: 'UNKNOWN CAFE 002',
      amount: -16.00,
      account: 'Amex',
      location: 'Manly',
      rawRow: '{}',
      checksum: 'unc002',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-14',
      description: 'UNKNOWN CAFE 003',
      amount: -14.75,
      account: 'Amex',
      location: 'Surry Hills',
      rawRow: '{}',
      checksum: 'unc003',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-14',
      description: 'UNKNOWN CAFE 004',
      amount: -15.00,
      account: 'Amex',
      location: 'Sydney',
      rawRow: '{}',
      checksum: 'unc004',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-15',
      description: 'MYSTERY STORE XYZ',
      amount: -99.99,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'unc005',
      entity: {
        entityName: 'Mystery Store',
        matchType: 'ai',
        confidence: 0.6,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-15',
      description: 'ACME CORP',
      amount: -250.00,
      account: 'Amex',
      online: true,
      rawRow: '{}',
      checksum: 'unc006',
      entity: {
        entityName: 'Acme Corporation',
        matchType: 'ai',
        confidence: 0.8,
      },
      status: 'uncertain',
    },
  ],
  failed: [
    {
      date: '2026-02-16',
      description: 'RANDOM MERCHANT 123',
      amount: -45.00,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'fail001',
      entity: {
        entityName: '',
        matchType: 'none',
      },
      status: 'failed',
    },
    {
      date: '2026-02-16',
      description: 'UNRECOGNIZED PAYEE',
      amount: -33.50,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'fail002',
      entity: {
        entityName: '',
        matchType: 'none',
      },
      status: 'failed',
    },
  ],
  skipped: [
    {
      date: '2026-02-10',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'abc123',
      status: 'skipped',
      skipReason: 'Duplicate transaction (checksum match)',
    },
  ],
});

/**
 * Bulk scenario: Many similar transactions for testing bulk operations
 */
export const createBulkMockData = (): MockImportResult => ({
  matched: [
    {
      date: '2026-02-10',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'abc123',
      entity: {
        entityId: 'woolworths-id',
        entityName: 'Woolworths',
        matchType: 'prefix',
      },
      status: 'matched',
    },
  ],
  uncertain: [
    // 6 similar cafe transactions
    {
      date: '2026-02-11',
      description: 'UNKNOWN CAFE BONDI',
      amount: -15.50,
      account: 'Amex',
      location: 'Bondi',
      rawRow: '{}',
      checksum: 'cafe001',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-11',
      description: 'UNKNOWN CAFE MANLY',
      amount: -16.00,
      account: 'Amex',
      location: 'Manly',
      rawRow: '{}',
      checksum: 'cafe002',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-12',
      description: 'UNKNOWN CAFE SURRY HILLS',
      amount: -14.75,
      account: 'Amex',
      location: 'Surry Hills',
      rawRow: '{}',
      checksum: 'cafe003',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-12',
      description: 'UNKNOWN CAFE CBD',
      amount: -15.00,
      account: 'Amex',
      location: 'Sydney',
      rawRow: '{}',
      checksum: 'cafe004',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-13',
      description: 'UNKNOWN CAFE PARRAMATTA',
      amount: -14.50,
      account: 'Amex',
      location: 'Parramatta',
      rawRow: '{}',
      checksum: 'cafe005',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
    {
      date: '2026-02-13',
      description: 'UNKNOWN CAFE NEWTOWN',
      amount: -15.25,
      account: 'Amex',
      location: 'Newtown',
      rawRow: '{}',
      checksum: 'cafe006',
      entity: {
        entityName: 'Unknown Cafe',
        matchType: 'ai',
        confidence: 0.7,
      },
      status: 'uncertain',
    },
  ],
  failed: [],
  skipped: [],
});

/**
 * Error scenario: Various warnings and errors
 */
export const createErrorMockData = (): MockImportResult => ({
  matched: [],
  uncertain: [],
  failed: [
    {
      date: '2026-02-16',
      description: 'FAILED TRANSACTION',
      amount: -100.00,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'err001',
      entity: {
        entityName: '',
        matchType: 'none',
      },
      status: 'failed',
    },
  ],
  skipped: [],
  warnings: [
    {
      type: 'NOTION_DATABASE_NOT_FOUND',
      message: 'Notion database not found. Check your .env configuration.',
    },
  ],
});

/**
 * Duplicates scenario: Testing duplicate detection
 */
export const createDuplicatesMockData = (): MockImportResult => ({
  matched: [
    {
      date: '2026-02-10',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'new001',
      entity: {
        entityId: 'woolworths-id',
        entityName: 'Woolworths',
        matchType: 'prefix',
      },
      status: 'matched',
    },
    {
      date: '2026-02-11',
      description: 'COLES 5678',
      amount: -87.25,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'new002',
      entity: {
        entityId: 'coles-id',
        entityName: 'Coles',
        matchType: 'prefix',
      },
      status: 'matched',
    },
  ],
  uncertain: [],
  failed: [],
  skipped: [
    {
      date: '2026-02-10',
      description: 'WOOLWORTHS 1234',
      amount: -125.50,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'dup001',
      status: 'skipped',
      skipReason: 'Duplicate transaction (checksum match)',
    },
    {
      date: '2026-02-10',
      description: 'COLES 5678',
      amount: -87.25,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'dup002',
      status: 'skipped',
      skipReason: 'Duplicate transaction (checksum match)',
    },
    {
      date: '2026-02-11',
      description: 'NETFLIX.COM',
      amount: -19.99,
      account: 'Amex',
      rawRow: '{}',
      checksum: 'dup003',
      status: 'skipped',
      skipReason: 'Duplicate transaction (checksum match)',
    },
  ],
});

/**
 * Warning scenarios
 */
export const createWarningMockData = (warningType: 'deduplication' | 'ai' | 'notion'): MockImportResult => {
  const baseData = createSimpleMockData();

  const warnings = {
    deduplication: {
      type: 'DEDUPLICATION_DISABLED',
      message: 'Deduplication is disabled. This is expected for new databases.',
    },
    ai: {
      type: 'AI_CATEGORIZATION_UNAVAILABLE',
      message: 'AI categorization service unavailable. Manual review recommended.',
      affectedCount: 5,
    },
    notion: {
      type: 'NOTION_DATABASE_NOT_FOUND',
      message: 'Notion database not found. Check your .env configuration.',
    },
  };

  return {
    ...baseData,
    warnings: [warnings[warningType]],
  };
};

/**
 * Main factory function
 */
export const createMockData = (scenario: MockScenario): MockImportResult => {
  switch (scenario) {
    case 'simple':
      return createSimpleMockData();
    case 'realistic':
      return createRealisticMockData();
    case 'bulk':
      return createBulkMockData();
    case 'errors':
      return createErrorMockData();
    case 'duplicates':
      return createDuplicatesMockData();
    default:
      return createSimpleMockData();
  }
};
