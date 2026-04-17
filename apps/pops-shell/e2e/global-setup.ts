/**
 * Playwright global setup — creates the 'e2e' named environment before tests run.
 *
 * The env system (POST /env/:name) creates an isolated SQLite database seeded
 * with test data. All real-API integration tests target this environment via
 * the ?env=e2e query param, leaving the prod database untouched.
 *
 * Runs AFTER webServer(s) are started, so the API is guaranteed to be up.
 */

const API_URL = process.env['FINANCE_API_URL'] ?? 'http://localhost:3000';
const ENV_NAME = 'e2e';

export default async function globalSetup(): Promise<void> {
  const url = `${API_URL}/env/${ENV_NAME}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'test', ttl: 7200 }), // 2-hour TTL
    });

    if (res.status === 201) {
      console.log(`[global-setup] Created e2e environment (seeded)`);
    } else if (res.status === 409) {
      // Already exists from a previous run — that's fine, seed data is idempotent
      console.log(`[global-setup] e2e environment already exists, reusing`);
    } else {
      const body = await res.text();
      throw new Error(`Failed to create e2e environment: ${res.status} ${body}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('fetch failed')) {
      if (process.env['CI']) {
        // In CI the API server must be up — Playwright's webServer config waits for it.
        // If we still can't reach it, fail loudly so the root cause is obvious.
        throw new Error(
          `[global-setup] API unreachable in CI — integration tests cannot run: ${err.message}`,
          { cause: err }
        );
      }
      // Locally the API might not be started; mocked tests will still run.
      console.warn(
        '[global-setup] API not reachable — skipping env creation (mocked tests will still run)'
      );
      return;
    }
    throw err;
  }
}
