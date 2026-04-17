import fs from 'fs';

/**
 * A single Up Bank transaction as normalised from the API response.
 */
export interface UpTransaction {
  id: string;
  description: string;
  rawText: string | null;
  /** Signed float parsed from the API `value` string, e.g. "-45.60" → -45.60 */
  amount: number;
  /** ISO 8601 datetime string */
  settledAt: string;
  /** UUID of the owning account */
  accountId: string;
}

const BASE_URL = 'https://api.up.com.au/api/v1';

/**
 * Resolve the Up Bank API token.
 *
 * Resolution order:
 * 1. `UP_API_TOKEN_FILE` env var — path to a file containing the token
 * 2. `UP_API_TOKEN` env var — the token itself
 *
 * Throws if neither is set.
 */
export function getUpApiToken(): string {
  const tokenFile = process.env['UP_API_TOKEN_FILE'];
  if (tokenFile) {
    return fs.readFileSync(tokenFile, 'utf-8').trim();
  }

  const token = process.env['UP_API_TOKEN'];
  if (token) {
    return token;
  }

  throw new Error(
    'Up Bank API token not found. Set UP_API_TOKEN or UP_API_TOKEN_FILE environment variable.'
  );
}

/**
 * Fetch all Up Bank accounts and return a map of account ID → display name.
 */
export async function fetchUpAccounts(token: string): Promise<Map<string, string>> {
  const response = await fetch(`${BASE_URL}/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Up Bank API error fetching accounts: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    data: Array<{
      id: string;
      attributes: { displayName: string; accountType: string };
    }>;
  };

  const accounts = new Map<string, string>();
  for (const account of body.data) {
    accounts.set(account.id, account.attributes.displayName);
  }

  return accounts;
}

/**
 * Fetch all transactions from the Up Bank API, handling pagination automatically.
 *
 * @param token - Up Bank API bearer token
 * @param since - Optional ISO 8601 date string (e.g. "2026-01-01") to filter transactions
 */
export async function fetchUpTransactions(token: string, since?: string): Promise<UpTransaction[]> {
  const params = new URLSearchParams({ 'page[size]': '100' });
  if (since) {
    // Up Bank API expects full ISO 8601 datetime
    const sinceDate = since.includes('T') ? since : `${since}T00:00:00+10:00`;
    params.set('filter[since]', sinceDate);
  }

  let url: string | null = `${BASE_URL}/transactions?${params.toString()}`;
  const transactions: UpTransaction[] = [];

  while (url !== null) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Up Bank API error fetching transactions: ${response.status} ${response.statusText}`
      );
    }

    const body = (await response.json()) as {
      data: Array<{
        id: string;
        attributes: {
          description: string;
          rawText: string | null;
          amount: { value: string };
          settledAt: string;
        };
        relationships: {
          account: { data: { id: string } };
        };
      }>;
      links: { next: string | null };
    };

    for (const item of body.data) {
      transactions.push({
        id: item.id,
        description: item.attributes.description,
        rawText: item.attributes.rawText,
        amount: parseFloat(item.attributes.amount.value),
        settledAt: item.attributes.settledAt,
        accountId: item.relationships.account.data.id,
      });
    }

    url = body.links.next;
  }

  return transactions;
}
