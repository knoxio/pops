import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsList: (...args: unknown[]) => mocks.list(...args),
}));

import { initialState } from '../../../store/import-store-types';
import { useImportStore } from '../../../store/importStore';
import { makeDraft } from '../pending/pending-import.test-helpers';
import { LiveArrivalsBanner } from './LiveArrivalsBanner';

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveArrivalsBanner />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.setState({ ...initialState });
});

describe('LiveArrivalsBanner', () => {
  it("counts the rows in the account's other live draft, once, and says they are held back", async () => {
    useImportStore.setState({
      draftId: 'open-one',
      accountId: 'acc-up',
      draftSource: { kind: 'live', provider: 'up' },
    });
    mocks.list.mockResolvedValue({
      data: {
        data: [
          makeDraft({ id: 'open-one', accountId: 'acc-up', state: 'live', rowCount: 7 }),
          makeDraft({ id: 'next', accountId: 'acc-up', state: 'live', rowCount: 4 }),
        ],
      },
      error: undefined,
    });
    renderBanner();
    expect(await screen.findByText('4 more transactions have arrived from Up')).toBeDefined();
    expect(mocks.list).toHaveBeenCalledWith({ query: { account: 'acc-up', state: 'live' } });
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it('renders nothing for a file draft, and nothing when no other draft is collecting', async () => {
    useImportStore.setState({ draftId: 'file-one', accountId: 'acc-1' });
    const { container, unmount } = renderBanner();
    expect(container.textContent).toBe('');
    expect(mocks.list).not.toHaveBeenCalled();
    unmount();

    useImportStore.setState({
      draftId: 'open-one',
      accountId: 'acc-up',
      draftSource: { kind: 'live', provider: 'up' },
    });
    mocks.list.mockResolvedValue({
      data: { data: [makeDraft({ id: 'open-one', accountId: 'acc-up', state: 'live' })] },
      error: undefined,
    });
    const second = renderBanner();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    expect(second.container.textContent).toBe('');
  });
});
