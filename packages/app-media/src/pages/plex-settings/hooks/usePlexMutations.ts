import { useEffect } from 'react';
import { toast } from 'sonner';

import { trpc } from '../../../lib/trpc';

interface UsePlexMutationsOptions {
  pinId: number | null;
  setPinId: (v: number | null) => void;
  setPinCode: (v: string | null) => void;
  syncStatus: { refetch: () => void };
  connectionTest: { refetch: () => void };
  currentUrl: { refetch: () => void };
  schedulerStatus: { refetch: () => void };
  syncLogs: { refetch: () => void };
}

export function usePlexMutations({
  pinId,
  setPinId,
  setPinCode,
  syncStatus,
  connectionTest,
  currentUrl,
  schedulerStatus,
  syncLogs,
}: UsePlexMutationsOptions) {
  const saveSectionIds = trpc.media.plex.saveSectionIds.useMutation({
    onError: (err: { message: string }) =>
      toast.error(`Failed to save library selection: ${err.message}`),
  });

  const saveUrl = trpc.media.plex.setUrl.useMutation({
    onSuccess: () => {
      toast.success('Server URL saved');
      syncStatus.refetch();
      connectionTest.refetch();
      currentUrl.refetch();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to save URL: ${err.message}`);
    },
  });

  const getPin = trpc.media.plex.getAuthPin.useMutation({
    onSuccess: (res: { data: { id: number; code: string; clientId: string } }) => {
      const { id, code } = res.data;
      setPinId(id);
      setPinCode(code);
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to start auth: ${err.message}`);
    },
  });

  const checkPin = trpc.media.plex.checkAuthPin.useMutation({
    onSuccess: (res: { data: { connected: boolean } }) => {
      if (res.data.connected) {
        toast.success('Plex account connected');
        setPinId(null);
        setPinCode(null);
        syncStatus.refetch();
        connectionTest.refetch();
      }
    },
    onError: (err: { message: string }) => {
      toast.error(`Auth check failed: ${err.message}`);
    },
  });

  const disconnect = trpc.media.plex.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Plex account disconnected');
      syncStatus.refetch();
      connectionTest.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to disconnect: ${err.message}`),
  });

  const startScheduler = trpc.media.plex.startScheduler.useMutation({
    onSuccess: () => {
      toast.success('Scheduler started');
      schedulerStatus.refetch();
      syncLogs.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to start scheduler: ${err.message}`),
  });

  const stopScheduler = trpc.media.plex.stopScheduler.useMutation({
    onSuccess: () => {
      toast.success('Scheduler stopped');
      schedulerStatus.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to stop scheduler: ${err.message}`),
  });

  // Poll for PIN auth completion
  useEffect(() => {
    if (!pinId) return;
    const interval = setInterval(() => {
      checkPin.mutate({ id: pinId });
    }, 3000);
    return () => clearInterval(interval);
  }, [pinId]);

  return {
    saveSectionIds,
    saveUrl,
    getPin,
    checkPin,
    disconnect,
    startScheduler,
    stopScheduler,
  };
}
