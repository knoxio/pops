import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@pops/ui';

interface PlexAuthFlowProps {
  status: { hasToken?: boolean; configured?: boolean } | undefined;
  pinId: number | null;
  pinCode: string | null;
  setPinId: (v: number | null) => void;
  setPinCode: (v: string | null) => void;
  getPin: { mutate: () => void; isPending: boolean; error: { message: string } | null };
  connectionError: string | undefined;
}

export function PlexAuthFlow({
  status,
  pinId,
  pinCode,
  setPinId,
  setPinCode,
  getPin,
  connectionError,
}: PlexAuthFlowProps) {
  return (
    <>
      {/* Authentication */}
      {!status?.hasToken ? (
        <div className="rounded-lg border bg-card p-6 text-center space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Plex Account</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Link your Plex account to enable library syncing and watch history tracking.
            </p>
          </div>

          <div className="pt-2">
            {pinId && pinCode ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Enter this code at{' '}
                    <a
                      href="https://plex.tv/link"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info/80 underline"
                    >
                      plex.tv/link
                    </a>
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                      {pinCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(pinCode);
                        toast.success('Code copied');
                      }}
                      aria-label="Copy PIN code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Checking for authentication...</span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPinId(null);
                    setPinCode(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => {
                  getPin.mutate();
                }}
                disabled={getPin.isPending}
              >
                {getPin.isPending ? 'Requesting...' : 'Connect to Plex'}
              </Button>
            )}
            {getPin.error && (
              <p className="text-xs text-destructive/80 mt-2">{getPin.error.message}</p>
            )}
          </div>
        </div>
      ) : !status?.configured ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="text-sm text-amber-200">
            Authenticated with Plex account, but server URL is missing. Set the URL above to finish
            setup.
          </div>
        </div>
      ) : null}

      {/* Connection error */}
      {connectionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive/80">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Connection Failed</p>
            <p>{connectionError}</p>
            <p className="text-xs opacity-70">
              Verify that the server URL is correct and the server is reachable from this
              application.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
