/**
 * ArrSettingsPage — Radarr/Sonarr connection settings and test UI.
 *
 * Allows users to configure Radarr and Sonarr URLs and API keys
 * via the settings table (replacing env-var-only configuration).
 */
import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Button,
  Skeleton,
  Input,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@pops/ui";
import { ArrowLeft, RefreshCw, Film, Tv, Save } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { ConnectionBadge } from "../components/ConnectionBadge";

function ServiceCard({
  label,
  icon: Icon,
  url,
  apiKey,
  hasKey,
  onUrlChange,
  onApiKeyChange,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
  apiKey: string;
  hasKey: boolean;
  onUrlChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
  testResult: { configured: boolean; connected: boolean; version?: string; error?: string } | null;
}) {
  const configured = !!(url && (hasKey || (apiKey && apiKey !== "••••••••")));

  const normalizeUrl = () => {
    const normalized = ensureProtocol(url);
    if (normalized !== url) onUrlChange(normalized);
  };

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{label}</h2>
        {testResult && configured && <ConnectionBadge connected={testResult.connected} />}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Server URL</label>
          <Input
            placeholder="https://192.168.1.100:7878"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onBlur={normalizeUrl}
            disabled={saving}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">API Key</label>
          <Input
            type="password"
            placeholder="Enter API key"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={onTest} disabled={testing || !configured}>
          {testing ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Test Connection
        </Button>
      </div>

      {testResult?.connected && testResult.version && (
        <p className="text-xs text-emerald-400">Connected — v{testResult.version}</p>
      )}
      {testResult && !testResult.connected && (
        <p className="text-xs text-red-400">{testResult.error ?? "Connection failed"}</p>
      )}
    </div>
  );
}

function ensureProtocol(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function ArrSettingsPage() {
  const [radarrUrl, setRadarrUrl] = useState("");
  const [radarrApiKey, setRadarrApiKey] = useState("");
  const [sonarrUrl, setSonarrUrl] = useState("");
  const [sonarrApiKey, setSonarrApiKey] = useState("");

  const utils = trpc.useUtils();
  const settingsQuery = trpc.media.arr.getSettings.useQuery();

  useEffect(() => {
    if (settingsQuery.data?.data) {
      const d = settingsQuery.data.data;
      setRadarrUrl(d.radarrUrl);
      setRadarrApiKey(d.radarrApiKey);
      setSonarrUrl(d.sonarrUrl);
      setSonarrApiKey(d.sonarrApiKey);
    }
  }, [settingsQuery.data?.data]);

  const saveSettings = trpc.media.arr.saveSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      void utils.media.arr.getConfig.invalidate();
    },
    onError: (err: { message: string }) => toast.error(`Failed to save: ${err.message}`),
  });

  const testRadarr = trpc.media.arr.testRadarr.useMutation();
  const testSonarr = trpc.media.arr.testSonarr.useMutation();

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media">Media</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Arr Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/media"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Back to Media"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Radarr & Sonarr Settings</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure your Radarr and Sonarr connections to see download status badges on movie and TV
        show pages.
      </p>

      <div className="grid gap-6">
        <ServiceCard
          label="Radarr"
          icon={Film}
          url={radarrUrl}
          apiKey={radarrApiKey}
          hasKey={settingsQuery.data?.data.radarrHasKey ?? false}
          onUrlChange={setRadarrUrl}
          onApiKeyChange={setRadarrApiKey}
          onSave={() => {
            const normalizedUrl = ensureProtocol(radarrUrl);
            if (normalizedUrl !== radarrUrl) setRadarrUrl(normalizedUrl);
            saveSettings.mutate({
              radarrUrl: normalizedUrl,
              radarrApiKey,
            });
          }}
          onTest={() => testRadarr.mutate({ url: ensureProtocol(radarrUrl), apiKey: radarrApiKey })}
          saving={saveSettings.isPending}
          testing={testRadarr.isPending}
          testResult={testRadarr.data?.data ?? null}
        />

        <ServiceCard
          label="Sonarr"
          icon={Tv}
          url={sonarrUrl}
          apiKey={sonarrApiKey}
          hasKey={settingsQuery.data?.data.sonarrHasKey ?? false}
          onUrlChange={setSonarrUrl}
          onApiKeyChange={setSonarrApiKey}
          onSave={() => {
            const normalizedUrl = ensureProtocol(sonarrUrl);
            if (normalizedUrl !== sonarrUrl) setSonarrUrl(normalizedUrl);
            saveSettings.mutate({
              sonarrUrl: normalizedUrl,
              sonarrApiKey,
            });
          }}
          onTest={() => testSonarr.mutate({ url: ensureProtocol(sonarrUrl), apiKey: sonarrApiKey })}
          saving={saveSettings.isPending}
          testing={testSonarr.isPending}
          testResult={testSonarr.data?.data ?? null}
        />
      </div>
    </div>
  );
}
