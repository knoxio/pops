import { describe, expect, it } from 'vitest';

import { discoveredPillar, FakeRegistryTransport } from '../../client/__tests__/fixtures.js';
import { InternalBaseUrlTransport } from '../transport.js';

describe('InternalBaseUrlTransport', () => {
  it('passes the snapshot through untouched when the override map is empty', async () => {
    const inner = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const transport = new InternalBaseUrlTransport(inner, {});
    const snapshot = await transport.fetchSnapshot();
    expect(snapshot[0]?.baseUrl).toBe('http://finance-api:3004');
  });

  it('rewrites the baseUrl for matching pillars', async () => {
    const inner = new FakeRegistryTransport({
      pillars: [
        discoveredPillar({ pillarId: 'finance', baseUrl: 'http://finance-api:3004' }),
        discoveredPillar({ pillarId: 'media', baseUrl: 'http://media-api:3005' }),
      ],
    });
    const transport = new InternalBaseUrlTransport(inner, {
      finance: 'http://localhost:3104',
    });
    const snapshot = await transport.fetchSnapshot();
    expect(snapshot.find((p) => p.pillarId === 'finance')?.baseUrl).toBe('http://localhost:3104');
    expect(snapshot.find((p) => p.pillarId === 'media')?.baseUrl).toBe('http://media-api:3005');
  });

  it('does not mutate the inner entries', async () => {
    const original = discoveredPillar({ pillarId: 'finance', baseUrl: 'http://x' });
    const inner = new FakeRegistryTransport({ pillars: [original] });
    const transport = new InternalBaseUrlTransport(inner, { finance: 'http://y' });
    await transport.fetchSnapshot();
    expect(original.baseUrl).toBe('http://x');
  });
});
