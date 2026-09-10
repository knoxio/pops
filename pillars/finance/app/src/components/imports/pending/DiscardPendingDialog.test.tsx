import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { DiscardPendingDialog, discardCopy } from './DiscardPendingDialog';
import { makeDraft } from './pending-import.test-helpers';

import type { TFunction } from 'i18next';

const t: TFunction<'finance'> = renderHook(() => useTranslation('finance')).result.current.t;

describe('discardCopy', () => {
  it('a live import loses only decisions and the bank resends', () => {
    expect(
      discardCopy(
        makeDraft({ state: 'live', source: { kind: 'live', provider: 'up' }, rowCount: 11 }),
        t
      )
    ).toEqual({
      title: 'Discard this Up import?',
      body: 'The 11 transactions are not deleted anywhere. Up still has them, and the next sync fetches them again. Only the decisions you made here are lost.',
      action: 'Discard, Up will resend',
    });
  });

  it('a file draft counts the decisions lost and names the file to upload again', () => {
    expect(discardCopy(makeDraft({ rowCount: 46, unresolvedCount: 3 }), t)).toEqual({
      title: 'Discard activity_2026-08.csv?',
      body: 'The 43 decisions you made in it are lost. The file itself is not stored: to import it later, upload activity_2026-08.csv again.',
      action: 'Discard',
    });
    expect(discardCopy(makeDraft({ rowCount: 2, unresolvedCount: 1 }), t).body).toMatch(
      /^The 1 decision you made in it is lost/
    );
  });

  it('an unusable draft counts no decisions', () => {
    expect(
      discardCopy(
        makeDraft({
          state: 'unusable',
          source: { kind: 'file', dialectId: 'ANZ', fileNames: ['Transactions.csv'] },
        }),
        t
      )
    ).toEqual({
      title: 'Discard Transactions.csv?',
      body: 'Nothing in this draft can be resumed. The file itself is not stored: to import it later, upload Transactions.csv again.',
      action: 'Discard',
    });
  });
});

describe('DiscardPendingDialog', () => {
  it('renders nothing without an item, and wires Keep it and the destructive action', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <DiscardPendingDialog item={null} onConfirm={onConfirm} onCancel={onCancel} />
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();

    rerender(
      <DiscardPendingDialog item={makeDraft({})} onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
