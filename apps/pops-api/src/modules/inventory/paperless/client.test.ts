/**
 * Paperless-ngx client unit tests — all HTTP calls mocked via vi.stubGlobal("fetch").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperlessClient } from './client.js';
import { PaperlessApiError } from './types.js';

function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const PAPERLESS_BASE_URL = 'http://paperless:8000';
const PAPERLESS_API_TOKEN = 'test-paperless-token';

let client: PaperlessClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = new PaperlessClient(PAPERLESS_BASE_URL, PAPERLESS_API_TOKEN);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaperlessClient constructor', () => {
  it('throws if base URL is empty', () => {
    expect(() => new PaperlessClient('', PAPERLESS_API_TOKEN)).toThrow('Paperless URL is required');
  });

  it('throws if token is empty', () => {
    expect(() => new PaperlessClient(PAPERLESS_BASE_URL, '')).toThrow(
      'Paperless token is required'
    );
  });

  it('strips trailing slash from base URL', () => {
    const c = new PaperlessClient('http://paperless:8000/', PAPERLESS_API_TOKEN);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );
    void c.searchDocuments('test');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^http:\/\/paperless:8000\/api/);
  });
});

describe('PaperlessClient authentication', () => {
  it('sends Token auth header', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );

    await client.searchDocuments('test');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe(
      `Token ${PAPERLESS_API_TOKEN}`
    );
  });

  it('sends Accept: application/json header', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );

    await client.searchDocuments('test');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Accept).toBe('application/json');
  });
});

describe('searchDocuments', () => {
  const rawDocuments = {
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        id: 42,
        correspondent: 3,
        document_type: 1,
        title: 'Invoice 2026-001',
        content: 'Total: $150.00',
        tags: [1, 5],
        created: '2026-01-15T10:30:00Z',
        created_date: '2026-01-15',
        modified: '2026-01-15T10:35:00Z',
        added: '2026-01-15T10:30:00Z',
        archive_serial_number: 1001,
        original_file_name: 'invoice-001.pdf',
        archived_file_name: '1001-invoice-001.pdf',
        notes: [],
      },
    ],
  };

  it('returns mapped search results', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(rawDocuments));

    const result = await client.searchDocuments('invoice');

    expect(result.count).toBe(1);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toEqual({
      id: 42,
      correspondentId: 3,
      documentTypeId: 1,
      title: 'Invoice 2026-001',
      content: 'Total: $150.00',
      tagIds: [1, 5],
      created: '2026-01-15T10:30:00Z',
      createdDate: '2026-01-15',
      modified: '2026-01-15T10:35:00Z',
      added: '2026-01-15T10:30:00Z',
      archiveSerialNumber: 1001,
      originalFileName: 'invoice-001.pdf',
      archivedFileName: '1001-invoice-001.pdf',
    });
  });

  it('passes query and page as URL parameters', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );

    await client.searchDocuments('receipt', 3);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('query=receipt');
    expect(url).toContain('page=3');
  });

  it('defaults page to 1', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );

    await client.searchDocuments('test');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page=1');
  });
});

describe('getDocument', () => {
  it('returns mapped document detail', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        id: 42,
        correspondent: null,
        document_type: null,
        title: 'Test Doc',
        content: 'Content here',
        tags: [],
        created: '2026-01-01T00:00:00Z',
        created_date: '2026-01-01',
        modified: '2026-01-01T00:00:00Z',
        added: '2026-01-01T00:00:00Z',
        archive_serial_number: null,
        original_file_name: 'test.pdf',
        archived_file_name: null,
        notes: [],
      })
    );

    const result = await client.getDocument(42);

    expect(result.id).toBe(42);
    expect(result.title).toBe('Test Doc');
    expect(result.correspondentId).toBeNull();
    expect(result.documentTypeId).toBeNull();
    expect(result.archiveSerialNumber).toBeNull();
    expect(result.archivedFileName).toBeNull();
  });

  it('calls correct URL', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        id: 42,
        correspondent: null,
        document_type: null,
        title: 'Test',
        content: '',
        tags: [],
        created: '',
        created_date: '',
        modified: '',
        added: '',
        archive_serial_number: null,
        original_file_name: '',
        archived_file_name: null,
        notes: [],
      })
    );

    await client.getDocument(42);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/documents/42/');
  });
});

describe('getDocumentMetadata', () => {
  it('returns raw metadata', async () => {
    const metadata = {
      original_checksum: 'abc123',
      original_size: 12345,
      original_mime_type: 'application/pdf',
    };
    fetchMock.mockResolvedValueOnce(mockResponse(metadata));

    const result = await client.getDocumentMetadata(42);

    expect(result.original_checksum).toBe('abc123');
    expect(result.original_size).toBe(12345);
  });
});

describe('getDocumentThumbnailUrl', () => {
  it('builds correct thumbnail URL', () => {
    const url = client.getDocumentThumbnailUrl(42);
    expect(url).toBe(`${PAPERLESS_BASE_URL}/api/documents/42/thumb/`);
  });
});

describe('getDocumentDownloadUrl', () => {
  it('builds correct download URL', () => {
    const url = client.getDocumentDownloadUrl(42);
    expect(url).toBe(`${PAPERLESS_BASE_URL}/api/documents/42/download/`);
  });
});

describe('getCorrespondents', () => {
  it('returns mapped correspondents', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            slug: 'acme-corp',
            name: 'Acme Corp',
            match: '',
            matching_algorithm: 1,
            is_insensitive: true,
            document_count: 15,
          },
          {
            id: 2,
            slug: 'insurance-co',
            name: 'Insurance Co',
            match: '',
            matching_algorithm: 1,
            is_insensitive: true,
            document_count: 8,
          },
        ],
      })
    );

    const result = await client.getCorrespondents();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 1,
      slug: 'acme-corp',
      name: 'Acme Corp',
      documentCount: 15,
    });
  });
});

describe('getTags', () => {
  it('returns mapped tags', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 5,
            slug: 'receipt',
            name: 'Receipt',
            colour: 3,
            match: '',
            matching_algorithm: 1,
            is_insensitive: true,
            is_inbox_tag: false,
            document_count: 42,
          },
        ],
      })
    );

    const result = await client.getTags();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 5,
      slug: 'receipt',
      name: 'Receipt',
      colour: 3,
      isInboxTag: false,
      documentCount: 42,
    });
  });
});

describe('getDocumentTypes', () => {
  it('returns mapped document types', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            slug: 'invoice',
            name: 'Invoice',
            match: '',
            matching_algorithm: 1,
            is_insensitive: true,
            document_count: 30,
          },
        ],
      })
    );

    const result = await client.getDocumentTypes();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      slug: 'invoice',
      name: 'Invoice',
      documentCount: 30,
    });
  });
});

describe('error handling', () => {
  it('throws PaperlessApiError on 401', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ detail: 'Invalid token.' }, 401, 'Unauthorized')
    );

    await expect(client.searchDocuments('test')).rejects.toThrow(PaperlessApiError);

    fetchMock.mockResolvedValueOnce(
      mockResponse({ detail: 'Invalid token.' }, 401, 'Unauthorized')
    );

    try {
      await client.searchDocuments('test');
    } catch (err) {
      expect(err).toBeInstanceOf(PaperlessApiError);
      expect((err as PaperlessApiError).status).toBe(401);
      expect((err as PaperlessApiError).message).toBe('Invalid token.');
    }
  });

  it('throws PaperlessApiError on 404', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ detail: 'Not found.' }, 404, 'Not Found'));

    await expect(client.getDocument(999)).rejects.toThrow(PaperlessApiError);
  });

  it('throws PaperlessApiError on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(client.searchDocuments('test')).rejects.toThrow(PaperlessApiError);

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    try {
      await client.searchDocuments('test');
    } catch (err) {
      expect(err).toBeInstanceOf(PaperlessApiError);
      expect((err as PaperlessApiError).status).toBe(0);
      expect((err as PaperlessApiError).message).toContain('Network error');
      expect((err as PaperlessApiError).message).toContain('ECONNREFUSED');
    }
  });

  it('passes AbortSignal.timeout to fetch for 5s timeout', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ count: 0, next: null, previous: null, results: [] })
    );

    await client.searchDocuments('test');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
  });

  it('uses fallback message when error has no detail', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500, 'Internal Server Error'));

    try {
      await client.searchDocuments('test');
    } catch (err) {
      expect(err).toBeInstanceOf(PaperlessApiError);
      expect((err as PaperlessApiError).status).toBe(500);
      expect((err as PaperlessApiError).message).toContain('500');
    }
  });
});
