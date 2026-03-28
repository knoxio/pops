/**
 * Shared *arr base HTTP client for Radarr/Sonarr APIs.
 *
 * Both services share the same API pattern: base URL + /api/v3/ + endpoint,
 * authenticated via X-Api-Key header.
 *
 * Each client instance maintains its own in-memory cache keyed by full URL
 * with a 30-second TTL, so Radarr and Sonarr caches cannot collide.
 */
import { ArrApiError, type ArrSystemStatus } from "./types.js";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 10_000;

export class ArrBaseClient {
  protected readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  /** Make an authenticated GET request to the *arr API. */
  protected async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    // Check cache
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    const data = (await response.json()) as T;

    // Store in cache
    this.cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });

    return data;
  }

  /** Flush all cached entries for this client instance. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Make an authenticated POST request to the *arr API. */
  protected async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Make an authenticated PUT request to the *arr API. */
  protected async put<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Test the connection by fetching system status. */
  async testConnection(): Promise<ArrSystemStatus> {
    return this.get<ArrSystemStatus>("/system/status");
  }
}
