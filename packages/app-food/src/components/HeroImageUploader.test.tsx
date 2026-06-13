/**
 * PRD-124 — HeroImageUploader RTL suite.
 *
 * Mocks the tRPC mutation hooks so the component can be exercised in
 * isolation. Toast errors are observed via `sonner.toast` mock.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMutate = vi.fn();
const removeMutate = vi.fn();
const uploadHooks = {
  isPending: false,
  onSuccess: null as null | ((res: unknown) => void),
  onError: null as null | ((err: { message: string }) => void),
};
const removeHooks = {
  isPending: false,
  onSuccess: null as null | (() => void),
  onError: null as null | ((err: { message: string }) => void),
};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: {
      onSuccess?: typeof uploadHooks.onSuccess & typeof removeHooks.onSuccess;
      onError?: typeof uploadHooks.onError & typeof removeHooks.onError;
    }
  ) => {
    const key = path.join('.');
    if (key === 'heroImage.upload') {
      uploadHooks.onSuccess = opts.onSuccess ?? null;
      uploadHooks.onError = opts.onError ?? null;
      return { mutate: uploadMutate, isPending: uploadHooks.isPending };
    }
    if (key === 'heroImage.remove') {
      removeHooks.onSuccess = opts.onSuccess ?? null;
      removeHooks.onError = opts.onError ?? null;
      return { mutate: removeMutate, isPending: removeHooks.isPending };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
}));

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

beforeEach(() => {
  uploadMutate.mockReset();
  removeMutate.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  onUploaded.mockReset();
  onRemoved.mockReset();
  uploadHooks.isPending = false;
  removeHooks.isPending = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroImageUploader', () => {
  describe('when no hero is set', () => {
    it('renders the drop-zone with prompt + size hint', () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      expect(screen.getByText(/drop an image/i)).toBeInTheDocument();
      expect(screen.getByText(/JPG, PNG, or WebP/i)).toBeInTheDocument();
    });

    it('uploads a valid image on file selection', async () => {
      render(
        <HeroImageUploader
          recipeId={42}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'shot.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(uploadMutate).toHaveBeenCalledTimes(1));
      const args = uploadMutate.mock.calls[0]?.[0] as {
        recipeId: number;
        mimeType: string;
        contentBase64: string;
      };
      expect(args.recipeId).toBe(42);
      expect(args.mimeType).toBe('image/jpeg');
      expect(args.contentBase64.length).toBeGreaterThan(0);
    });

    it('rejects an unsupported mime type without invoking the mutation', async () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File(['x'], 'shot.gif', { type: 'image/gif' });
      // Bypass userEvent.upload's `accept` filter so the change handler still
      // runs — we want to assert the in-component validator rejects it.
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(uploadMutate).not.toHaveBeenCalled();
    });

    it('rejects an oversize file', async () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
          maxBytes={4}
        />
      );
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'big.jpg', {
        type: 'image/jpeg',
      });
      await userEvent.upload(input, file);
      expect(uploadMutate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/limit/i));
    });

    it('accepts a file via drag-drop', async () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const dropZone = screen.getByRole('button');
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'drop.png', { type: 'image/png' });
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
      await waitFor(() => expect(uploadMutate).toHaveBeenCalledTimes(1));
    });

    it('fires onUploaded + success toast when the mutation resolves', async () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(uploadMutate).toHaveBeenCalled());
      uploadHooks.onSuccess?.({ data: { heroImagePath: '1/hero.jpg' } });
      expect(onUploaded).toHaveBeenCalledWith('1/hero.jpg');
      expect(toastSuccess).toHaveBeenCalled();
    });

    it('surfaces server errors via toast', async () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const input = screen.getByTestId('hero-image-uploader-input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.jpg', { type: 'image/jpeg' });
      await userEvent.upload(input, file);
      await waitFor(() => expect(uploadMutate).toHaveBeenCalled());
      uploadHooks.onError?.({ message: 'boom' });
      expect(toastError).toHaveBeenCalledWith('boom');
    });
  });

  describe('when a hero is set', () => {
    it('renders the current image with replace + remove actions', () => {
      render(
        <HeroImageUploader
          recipeId={7}
          currentPath="7/hero.png"
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const img = screen.getByRole('img', { name: /recipe hero image/i }) as HTMLImageElement;
      // The renderer picks card-size when available.
      expect(img.getAttribute('src')).toBe('/api/food/recipes/7/hero-card.webp');
      expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('falls back to the original on card-thumb 404', () => {
      render(
        <HeroImageUploader
          recipeId={7}
          currentPath="7/hero.png"
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      const img = screen.getByRole('img', { name: /recipe hero image/i }) as HTMLImageElement;
      fireEvent.error(img);
      expect(img.getAttribute('src')).toBe('/api/food/recipes/7/hero.png');
    });

    it('calls the remove mutation when Remove is clicked', async () => {
      render(
        <HeroImageUploader
          recipeId={11}
          currentPath="11/hero.jpg"
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /remove/i }));
      expect(removeMutate).toHaveBeenCalledWith({ recipeId: 11 });
      removeHooks.onSuccess?.();
      expect(onRemoved).toHaveBeenCalledTimes(1);
      expect(toastSuccess).toHaveBeenCalled();
    });
  });

  describe('progress + accessibility', () => {
    it('shows the uploading state while the mutation is in flight', () => {
      uploadHooks.isPending = true;
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    });

    it('exposes the drop-zone as a button for keyboard activation', () => {
      render(
        <HeroImageUploader
          recipeId={1}
          currentPath={null}
          onUploaded={onUploaded}
          onRemoved={onRemoved}
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
