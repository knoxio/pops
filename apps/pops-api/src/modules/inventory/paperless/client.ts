/**
 * Paperless-ngx API HTTP client — typed wrapper around the Paperless-ngx REST API.
 *
 * Handles authentication (Token-based), request construction,
 * response parsing, and error mapping. Contains no business logic.
 *
 * Paperless-ngx API docs: https://docs.paperless-ngx.com/api/
 */
import {
  PaperlessApiError,
  type RawPaperlessPaginatedResponse,
  type RawPaperlessDocument,
  type RawPaperlessCorrespondent,
  type RawPaperlessTag,
  type RawPaperlessDocumentType,
  type PaperlessDocument,
  type PaperlessCorrespondent,
  type PaperlessTag,
  type PaperlessDocumentType,
  type PaperlessSearchResult,
} from "./types.js";

export class PaperlessClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error("Paperless URL is required");
    }
    if (!token) {
      throw new Error("Paperless token is required");
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  /** Search documents by query string. */
  async searchDocuments(query: string, page = 1): Promise<PaperlessSearchResult> {
    const params = new URLSearchParams({
      query,
      page: String(page),
    });
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessDocument>>(
      `/api/documents/?${params.toString()}`
    );
    return {
      documents: raw.results.map((d) => this.mapDocument(d)),
      count: raw.count,
      next: raw.next,
      previous: raw.previous,
    };
  }

  /** Get a single document by ID. */
  async getDocument(id: number): Promise<PaperlessDocument> {
    const raw = await this.get<RawPaperlessDocument>(`/api/documents/${id}/`);
    return this.mapDocument(raw);
  }

  /** Get document metadata (custom fields, etc). */
  async getDocumentMetadata(id: number): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/api/documents/${id}/metadata/`);
  }

  /** Build the thumbnail URL for a document. */
  getDocumentThumbnailUrl(id: number): string {
    return `${this.baseUrl}/api/documents/${id}/thumb/`;
  }

  /** Build the download URL for a document. */
  getDocumentDownloadUrl(id: number): string {
    return `${this.baseUrl}/api/documents/${id}/download/`;
  }

  /** List all correspondents. */
  async getCorrespondents(): Promise<PaperlessCorrespondent[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessCorrespondent>>(
      "/api/correspondents/?page_size=100"
    );
    return raw.results.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      documentCount: c.document_count,
    }));
  }

  /** List all tags. */
  async getTags(): Promise<PaperlessTag[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessTag>>(
      "/api/tags/?page_size=100"
    );
    return raw.results.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      colour: t.colour,
      isInboxTag: t.is_inbox_tag,
      documentCount: t.document_count,
    }));
  }

  /** List all document types. */
  async getDocumentTypes(): Promise<PaperlessDocumentType[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessDocumentType>>(
      "/api/document_types/?page_size=100"
    );
    return raw.results.map((dt) => ({
      id: dt.id,
      slug: dt.slug,
      name: dt.name,
      documentCount: dt.document_count,
    }));
  }

  // -------------------------------------------------------------------------
  // Mappers
  // -------------------------------------------------------------------------

  private mapDocument(raw: RawPaperlessDocument): PaperlessDocument {
    return {
      id: raw.id,
      correspondentId: raw.correspondent,
      documentTypeId: raw.document_type,
      title: raw.title,
      content: raw.content,
      tagIds: raw.tags,
      created: raw.created,
      createdDate: raw.created_date,
      modified: raw.modified,
      added: raw.added,
      archiveSerialNumber: raw.archive_serial_number,
      originalFileName: raw.original_file_name,
      archivedFileName: raw.archived_file_name,
    };
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new PaperlessApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `Paperless API error: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) {
          message = body.detail;
        }
      } catch {
        // Ignore parse failures
      }
      throw new PaperlessApiError(response.status, message);
    }

    return (await response.json()) as T;
  }
}
