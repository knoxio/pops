import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getBulk: vi.fn(),
  setBulkMutate: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    core: {
      settings: {
        getBulk: {
          useQuery: (input: unknown) => mocks.getBulk(input),
        },
        setBulk: {
          useMutation: () => ({ mutate: mocks.setBulkMutate }),
        },
      },
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo, success: mocks.toastSuccess },
}));

import { SectionRenderer } from './SectionRenderer';

import type { SettingsManifest } from '@pops/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<SettingsManifest> = {}): SettingsManifest {
  return {
    id: 'test',
    title: 'Test',
    order: 0,
    groups: [],
    ...overrides,
  };
}

function defaultBulkData(settings: Record<string, string> = {}) {
  return { data: { settings }, isLoading: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBulk.mockReturnValue(defaultBulkData());
  });

  describe('field type rendering', () => {
    it('renders the correct widget for each field type', () => {
      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'All Types',
            fields: [
              { key: 'f_text', label: 'Text Field', type: 'text', default: '' },
              { key: 'f_number', label: 'Number Field', type: 'number', default: '0' },
              {
                key: 'f_toggle',
                label: 'Toggle Field',
                type: 'toggle',
                default: 'false',
              },
              {
                key: 'f_select',
                label: 'Select Field',
                type: 'select',
                default: 'a',
                options: [
                  { value: 'a', label: 'Option A' },
                  { value: 'b', label: 'Option B' },
                ],
              },
              { key: 'f_password', label: 'Password Field', type: 'password', default: '' },
              { key: 'f_url', label: 'URL Field', type: 'url', default: '' },
              { key: 'f_duration', label: 'Duration Field', type: 'duration', default: '60000' },
              { key: 'f_json', label: 'JSON Field', type: 'json', default: '{}' },
            ],
          },
        ],
      });

      render(<SectionRenderer manifest={manifest} />);

      // text — renders <input type="text">
      const textInput = screen
        .getAllByRole('textbox')
        .find((el) => el.getAttribute('type') === 'text' || el.getAttribute('type') === null);
      expect(textInput).toBeInTheDocument();

      // number — renders <input type="number">
      const numberInputs = screen.getAllByRole('spinbutton');
      expect(numberInputs.length).toBeGreaterThanOrEqual(2); // number + duration

      // toggle — renders a checkbox role (Switch)
      expect(screen.getByRole('switch')).toBeInTheDocument();

      // select — renders its own combobox distinct from the duration unit selector
      const selectField = screen.getAllByRole('combobox').find((el) => {
        const optionValues = Array.from((el as HTMLSelectElement).options).map((o) => o.value);
        return !optionValues.every((v) =>
          ['milliseconds', 'seconds', 'minutes', 'hours'].includes(v)
        );
      });
      expect(selectField).toBeInTheDocument();

      // password — renders <input type="password">
      const passwordInput = document.querySelector('input[type="password"]');
      expect(passwordInput).toBeInTheDocument();

      // url — renders <input type="url">
      const urlInput = document.querySelector('input[type="url"]');
      expect(urlInput).toBeInTheDocument();

      // duration — number input + unit selector
      const durationUnitSelect = screen
        .getAllByRole('combobox')
        .find((el) =>
          ['milliseconds', 'seconds', 'minutes', 'hours'].includes((el as HTMLSelectElement).value)
        );
      expect(durationUnitSelect).toBeInTheDocument();

      // json — renders a <textarea>
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeInTheDocument();
    });
  });

  describe('debounced auto-save', () => {
    it('calls setBulk after 500ms and not before', async () => {
      vi.useFakeTimers();

      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Auto-save',
            fields: [{ key: 'api_url', label: 'API URL', type: 'text', default: '' }],
          },
        ],
      });

      render(<SectionRenderer manifest={manifest} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'https://example.com' } });

      // Not called immediately
      expect(mocks.setBulkMutate).not.toHaveBeenCalled();

      // Not called at 499ms
      await act(async () => {
        vi.advanceTimersByTime(499);
      });
      expect(mocks.setBulkMutate).not.toHaveBeenCalled();

      // Called at 500ms
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(mocks.setBulkMutate).toHaveBeenCalledOnce();
      expect(mocks.setBulkMutate).toHaveBeenCalledWith(
        { entries: [{ key: 'api_url', value: 'https://example.com' }] },
        expect.any(Object)
      );

      vi.useRealTimers();
    });
  });

  describe('pattern validation', () => {
    it('shows error and does not call setBulk when value fails pattern', async () => {
      vi.useFakeTimers();

      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Validation',
            fields: [
              {
                key: 'port',
                label: 'Port',
                type: 'text',
                default: '',
                validation: {
                  pattern: '^\\d+$',
                  message: 'Must be a number',
                },
              },
            ],
          },
        ],
      });

      render(<SectionRenderer manifest={manifest} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'not-a-number' } });

      // Error message shown
      expect(screen.getByText('Must be a number')).toBeInTheDocument();

      // Even after 500ms, setBulk must not have been called
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(mocks.setBulkMutate).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('environment variable fallback', () => {
    it('shows "Using environment variable" label when no DB value exists', () => {
      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Env Fallback',
            fields: [
              {
                key: 'plex_token',
                label: 'Plex Token',
                type: 'password',
                envFallback: 'PLEX_TOKEN',
              },
            ],
          },
        ],
      });

      // DB returns no value for plex_token
      mocks.getBulk.mockReturnValue(defaultBulkData({}));

      render(<SectionRenderer manifest={manifest} />);

      expect(screen.getByText('Using environment variable PLEX_TOKEN')).toBeInTheDocument();
    });

    it('does not show the label when a DB value exists', () => {
      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Env Fallback',
            fields: [
              {
                key: 'plex_token',
                label: 'Plex Token',
                type: 'password',
                envFallback: 'PLEX_TOKEN',
              },
            ],
          },
        ],
      });

      mocks.getBulk.mockReturnValue(defaultBulkData({ plex_token: 'my-secret-token' }));

      render(<SectionRenderer manifest={manifest} />);

      expect(screen.queryByText('Using environment variable PLEX_TOKEN')).not.toBeInTheDocument();
    });
  });

  describe('async options loader', () => {
    it('shows a disabled loading placeholder while in-flight and enables the select after resolve', async () => {
      let resolveLoader!: (opts: { value: string; label: string }[]) => void;
      const loaderPromise = new Promise<{ value: string; label: string }[]>((res) => {
        resolveLoader = res;
      });

      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Async Select',
            fields: [
              { key: 'library', label: 'Library', type: 'select', default: '', options: [] },
            ],
          },
        ],
      });

      render(
        <SectionRenderer manifest={manifest} optionsLoaders={{ library: () => loaderPromise }} />
      );

      await act(async () => {});

      // While loading — select is disabled with the placeholder text
      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
      expect(screen.getByText('Loading options\u2026')).toBeInTheDocument();

      // Resolve the loader with options
      await act(async () => {
        resolveLoader([{ value: 'movies', label: 'Movies' }]);
        await loaderPromise;
      });

      // Select is now interactive with the loaded options
      expect(screen.getByRole('combobox')).not.toBeDisabled();
      expect(screen.getByText('Movies')).toBeInTheDocument();
      expect(screen.queryByText('Loading options\u2026')).not.toBeInTheDocument();
    });

    it('enables the select after the loader rejects, falling back to static options', async () => {
      let rejectLoader!: (err: Error) => void;
      const loaderPromise = new Promise<{ value: string; label: string }[]>((_, rej) => {
        rejectLoader = rej;
      });

      const manifest = makeManifest({
        groups: [
          {
            id: 'g1',
            title: 'Async Select',
            fields: [
              {
                key: 'library',
                label: 'Library',
                type: 'select',
                default: '',
                options: [{ value: 'fallback', label: 'Fallback Option' }],
              },
            ],
          },
        ],
      });

      render(
        <SectionRenderer manifest={manifest} optionsLoaders={{ library: () => loaderPromise }} />
      );

      await act(async () => {});

      // While loading
      expect(screen.getByRole('combobox')).toBeDisabled();

      // Reject the loader
      await act(async () => {
        rejectLoader(new Error('Network error'));
        await loaderPromise.catch(() => {});
      });

      // Select is enabled with static fallback options
      expect(screen.getByRole('combobox')).not.toBeDisabled();
      expect(screen.getByText('Fallback Option')).toBeInTheDocument();
    });
  });

  describe('test action button', () => {
    it('calls onTestAction with the procedure when the test button is clicked', async () => {
      vi.useFakeTimers();

      try {
        const onTestAction = vi.fn().mockResolvedValue(undefined);

        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Connection',
              fields: [
                {
                  key: 'plex_url',
                  label: 'Plex URL',
                  type: 'url',
                  default: 'http://plex.local',
                  testAction: {
                    procedure: 'media.plex.testConnection',
                    label: 'Test Connection',
                  },
                },
              ],
            },
          ],
        });

        render(<SectionRenderer manifest={manifest} onTestAction={onTestAction} />);

        const testButton = screen.getByRole('button', { name: /test connection/i });
        fireEvent.click(testButton);

        await act(async () => {
          await Promise.resolve();
        });

        expect(onTestAction).toHaveBeenCalledOnce();
        expect(onTestAction).toHaveBeenCalledWith('media.plex.testConnection');
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });

    it('shows a success toast when the test action resolves', async () => {
      vi.useFakeTimers();

      try {
        const onTestAction = vi.fn().mockResolvedValue(undefined);

        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Connection',
              fields: [
                {
                  key: 'plex_url',
                  label: 'Plex URL',
                  type: 'url',
                  default: 'http://plex.local',
                  testAction: { procedure: 'media.plex.testConnection', label: 'Test Connection' },
                },
              ],
            },
          ],
        });

        render(<SectionRenderer manifest={manifest} onTestAction={onTestAction} />);

        fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

        await act(async () => {
          await Promise.resolve();
        });

        expect(mocks.toastSuccess).toHaveBeenCalledWith('Connected');
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });

    it('shows an error toast when the test action throws', async () => {
      vi.useFakeTimers();

      try {
        const onTestAction = vi.fn().mockRejectedValue(new Error('Plex not configured'));

        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Connection',
              fields: [
                {
                  key: 'plex_token',
                  label: 'Plex Token',
                  type: 'password',
                  testAction: { procedure: 'media.plex.testConnection', label: 'Test Connection' },
                },
              ],
            },
          ],
        });

        render(<SectionRenderer manifest={manifest} onTestAction={onTestAction} />);

        fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

        await act(async () => {
          await Promise.resolve();
        });

        expect(mocks.toastError).toHaveBeenCalledWith('Plex not configured');
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });
  });

  describe('restart-required toast', () => {
    it('fires toast.info when a requiresRestart field saves successfully', async () => {
      vi.useFakeTimers();
      try {
        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Server',
              fields: [
                {
                  key: 'server.port',
                  label: 'Port',
                  type: 'text',
                  default: '',
                  requiresRestart: true,
                },
              ],
            },
          ],
        });
        render(<SectionRenderer manifest={manifest} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '9000' } });
        await act(async () => {
          vi.advanceTimersByTime(500);
        });

        expect(mocks.setBulkMutate).toHaveBeenCalledOnce();
        const [, callbacks] = mocks.setBulkMutate.mock.calls[0] as [
          unknown,
          { onSuccess: () => void },
        ];
        await act(async () => {
          callbacks.onSuccess();
        });

        expect(mocks.toastInfo).toHaveBeenCalledWith(
          'Setting saved — restart required for this change to take effect'
        );
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });

    it('does not fire toast.info for non-requiresRestart fields on success', async () => {
      vi.useFakeTimers();
      try {
        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Server',
              fields: [{ key: 'plex.url', label: 'URL', type: 'text', default: '' }],
            },
          ],
        });
        render(<SectionRenderer manifest={manifest} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'http://plex.local' } });
        await act(async () => {
          vi.advanceTimersByTime(500);
        });

        const [, callbacks] = mocks.setBulkMutate.mock.calls[0] as [
          unknown,
          { onSuccess: () => void },
        ];
        await act(async () => {
          callbacks.onSuccess();
        });

        expect(mocks.toastInfo).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });

    it('does not fire toast.info on error even for requiresRestart fields', async () => {
      vi.useFakeTimers();
      try {
        const manifest = makeManifest({
          groups: [
            {
              id: 'g1',
              title: 'Server',
              fields: [
                {
                  key: 'server.port',
                  label: 'Port',
                  type: 'text',
                  default: '',
                  requiresRestart: true,
                },
              ],
            },
          ],
        });
        render(<SectionRenderer manifest={manifest} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '9000' } });
        await act(async () => {
          vi.advanceTimersByTime(500);
        });

        const [, callbacks] = mocks.setBulkMutate.mock.calls[0] as [
          unknown,
          { onError: (err: Error) => void },
        ];
        await act(async () => {
          callbacks.onError(new Error('save failed'));
        });

        expect(mocks.toastInfo).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        vi.useRealTimers();
      }
    });
  });
});
