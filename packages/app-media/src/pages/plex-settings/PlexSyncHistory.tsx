import { History } from 'lucide-react';

interface SyncLog {
  id: number;
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  durationMs: number | null;
  errors: string[] | null;
}

interface PlexSyncHistoryProps {
  syncLogs: SyncLog[];
}

export function PlexSyncHistory({ syncLogs }: PlexSyncHistoryProps) {
  if (syncLogs.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Sync History</h2>
      </div>

      <div className="space-y-2">
        {syncLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-center gap-3 flex-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground min-w-35">
              {new Date(log.syncedAt).toLocaleString()}
            </span>
            <span className="text-emerald-400">{log.moviesSynced} movies</span>
            <span className="text-blue-400">{log.tvShowsSynced} TV</span>
            {log.durationMs != null && (
              <span className="text-muted-foreground text-xs">
                {(log.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            {log.errors && log.errors.length > 0 && (
              <span className="text-red-400 text-xs">
                {log.errors.length} error{log.errors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
