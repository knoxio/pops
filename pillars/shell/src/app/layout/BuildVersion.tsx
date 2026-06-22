import { useEffect, useState } from 'react';

/**
 * Truncate a version label to a short SHA. Build hashes are 40 chars and
 * blow out the topbar; sequential CI numbers used to be short enough to
 * show in full but the build now stamps the full git SHA. We keep the
 * one-letter prefix (`f` / `a`) and the first 7 hex chars — full value is
 * still available via the title attribute for copy/paste.
 */
export function shortVersion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === 'dev') return raw;
  const match = /^([fa])([0-9a-f]+)$/i.exec(raw);
  if (!match) return raw.length > 8 ? raw.slice(0, 8) : raw;
  const [, prefix, sha] = match;
  return `${prefix}${(sha ?? '').slice(0, 7)}`;
}

/** Faded mono build version label showing frontend and API versions. */
export function BuildVersion() {
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((data: { version?: string }) => {
        if (data.version) setApiVersion(data.version);
      })
      .catch(() => {
        /* health endpoint unavailable — skip */
      });
  }, []);

  const frontendVersion = __BUILD_VERSION__;
  const display = [shortVersion(frontendVersion), shortVersion(apiVersion)]
    .filter(Boolean)
    .join(' · ');
  const fullTitle = [frontendVersion, apiVersion].filter(Boolean).join(' · ');

  return (
    <span className="text-[10px] text-muted-foreground/50 font-mono" title={fullTitle}>
      {display}
    </span>
  );
}
