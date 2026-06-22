/**
 * Playwright global teardown — deletes the 'e2e' environment after all tests finish.
 * The TTL watcher would eventually clean it up anyway, but explicit teardown is tidier.
 */

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e';

export default async function globalTeardown(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/env/${ENV_NAME}`, { method: 'DELETE' });
    if (res.status === 204) {
      console.log('[global-teardown] Deleted e2e environment');
    } else if (res.status === 410) {
      console.log('[global-teardown] e2e environment already gone');
    }
  } catch {
    // API might be shut down by now — not an error
  }
}
