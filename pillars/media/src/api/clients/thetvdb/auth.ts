/**
 * TheTVDB v4 authentication — JWT token management.
 *
 * Handles login via POST /login, token caching, and auto-refresh.
 */
import { type RawTvdbLoginResponse, TvdbApiError } from './types.js';

const LOGIN_URL = 'https://api4.thetvdb.com/v4/login';

/** Token lifetime buffer — re-authenticate if token expires within 24 hours. */
const EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000;

/** Default token lifetime — TheTVDB tokens last ~1 month. */
const TOKEN_LIFETIME_MS = 28 * 24 * 60 * 60 * 1000;

export class TheTvdbAuth {
  private readonly apiKey: string;
  private token: string | null = null;
  private expiresAt = 0;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('TheTVDB API key is required');
    }
    this.apiKey = apiKey;
  }

  /** Get a valid token, re-authenticating if needed. */
  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - EXPIRY_BUFFER_MS) {
      return this.token;
    }
    return this.login();
  }

  /** Force a fresh login and cache the new token. */
  async login(): Promise<string> {
    let response: Response;

    try {
      response = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: this.apiKey }),
      });
    } catch (err) {
      throw new TvdbApiError(
        0,
        `Network error during TheTVDB login: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `TheTVDB login failed: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) {
          message = body.message;
        }
      } catch {
        // Ignore parse failures
      }
      throw new TvdbApiError(response.status, message);
    }

    const body = (await response.json()) as RawTvdbLoginResponse;
    this.token = body.data.token;
    this.expiresAt = Date.now() + TOKEN_LIFETIME_MS;

    return this.token;
  }

  /** Invalidate the cached token, forcing re-auth on next getToken(). */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}
