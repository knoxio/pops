/**
 * PRD-124 — HeroImageUploader RTL suite.
 *
 * Mocks the generated food SDK so the upload + remove mutations can be
 * exercised in isolation. Toast errors are observed via `sonner.toast`
 * mock. The component drives the mutations through React Query, so each
 * render is wrapped in a `QueryClientProvider`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  heroImageUpload: vi.fn(),
  heroImageRemove: vi.fn(),
}));

vi.mock('../food-api/index.js', () => sdk);

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { HeroImageUploader } from './HeroImageUploader';

const onUploaded = vi.fn();
const onRemoved = vi.fn();

function uploadSuccess(heroImagePath: string) {
  return {
    data: {
      data: { heroImagePath, height: 1, width: 1, sizeBytes: 1 },
      message: 'ok',
    },
  };
}

function renderUploader(overrides: Partial<Parameters<typeof HeroImageUploader>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactElement }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <HeroImageUploader
      recipeId={1}
      currentPath={null}
      onUploaded={onUploaded}
      onRemoved={onRemoved}
      {...overrides}
    />,
    { wrapper: Wrapper }
  );
}

beforeEach(() => {
  sdk.heroImageUpload.mockReset();
  sdk.heroImageRemove.mockReset();
  sdk.heroImageUpload.mockResolvedValue(uploadSuccess('1/hero.jpg'));
  sdk.heroImageRemove.mockResolvedValue({ data: { ok: true } });
  toastSuccess.mockReset();
  toastError.mockReset();
  onUploaded.mockReset();
  onRemoved.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroImageUploader', () => {
  describe('when no hero is set', () => {
    it('renders the drop-zone with prompt + size hint', () => {
      renderUploader();
      expect(screen.getByText(/drop an image/i)).toBeInTheDocument();
      expect(screen.getByText(/JPG, PNG, or WebP/i)).toBeInTheDocument();
    });

    it('uploads a valid image on file selection', async () => {
      renderUploader({ recipeId: 42 });
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'shot.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(sdk.heroImageUpload).toHaveBeenCalledTimes(1));
      const call = sdk.heroImageUpload.mock.calls[0]?.[0] as {
        path: { recipeId: number };
        body: { mimeType: string; contentBase64: string };
      };
      expect(call.path.recipeId).toBe(42);
      expect(call.body.mimeType).toBe('image/jpeg');
      expect(call.body.contentBase64.length).toBeGreaterThan(0);
    });

    it('rejects an unsupported mime type without invoking the mutation', async () => {
      renderUploader();
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File(['x'], 'shot.gif', { type: 'image/gif' });
      // Bypass userEvent.upload's `accept` filter so the change handler still
      // runs — we want to assert the in-component validator rejects it.
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(sdk.heroImageUpload).not.toHaveBeenCalled();
    });

    it('rejects an oversize file', async () => {
      renderUploader({ maxBytes: 4 });
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'big.jpg', {
        type: 'image/jpeg',
      });
      await userEvent.upload(input, file);
      expect(sdk.heroImageUpload).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/limit/i));
    });

    it('accepts a file via drag-drop', async () => {
      renderUploader();
      const dropZone = screen.getByRole('button');
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'drop.png', { type: 'image/png' });
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
      await waitFor(() => expect(sdk.heroImageUpload).toHaveBeenCalledTimes(1));
    });

    it('fires onUploaded + success toast when the mutation resolves', async () => {
      renderUploader();
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('1/hero.jpg'));
      expect(toastSuccess).toHaveBeenCalled();
    });

    it('surfaces server errors via toast', async () => {
      sdk.heroImageUpload.mockResolvedValue({
        error: { message: 'boom' },
        response: { status: 500 },
      });
      renderUploader();
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
    });
  });

  describe('when a hero is set', () => {
    it('renders the current image with replace + remove actions', () => {
      renderUploader({ recipeId: 7, currentPath: '7/hero.png' });
      const img = screen.getByRole('img', { name: /recipe hero image/i }) as HTMLImageElement;
      // The renderer picks card-size when available.
      expect(img.getAttribute('src')).toBe('/api/food/recipes/7/hero-card.webp');
      expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('falls back to the original on card-thumb 404', () => {
      renderUploader({ recipeId: 7, currentPath: '7/hero.png' });
      const img = screen.getByRole('img', { name: /recipe hero image/i }) as HTMLImageElement;
      fireEvent.error(img);
      expect(img.getAttribute('src')).toBe('/api/food/recipes/7/hero.png');
    });

    it('calls the remove mutation when Remove is clicked', async () => {
      renderUploader({ recipeId: 11, currentPath: '11/hero.jpg' });
      await userEvent.click(screen.getByRole('button', { name: /remove/i }));
      await waitFor(() => expect(sdk.heroImageRemove).toHaveBeenCalledTimes(1));
      const call = sdk.heroImageRemove.mock.calls[0]?.[0] as { path: { recipeId: number } };
      expect(call.path.recipeId).toBe(11);
      await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
      expect(toastSuccess).toHaveBeenCalled();
    });
  });

  describe('progress + accessibility', () => {
    it('shows the uploading state while the mutation is in flight', async () => {
      let resolveUpload: ((value: unknown) => void) | undefined;
      sdk.heroImageUpload.mockReturnValue(
        new Promise((res) => {
          resolveUpload = res;
        })
      );
      renderUploader();
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(screen.getByText(/uploading/i)).toBeInTheDocument());
      resolveUpload?.(uploadSuccess('1/hero.jpg'));
    });

    it('exposes the drop-zone as a button for keyboard activation', () => {
      renderUploader();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
