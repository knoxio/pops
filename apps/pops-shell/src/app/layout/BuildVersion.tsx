import { useEffect, useState } from "react";

/** Faded mono build version label showing frontend and API versions. */
export function BuildVersion() {
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: { version?: string }) => {
        if (data.version) setApiVersion(data.version);
      })
      .catch(() => {
        /* health endpoint unavailable — skip */
      });
  }, []);

  const frontendVersion = __BUILD_VERSION__;
  const parts = [frontendVersion, apiVersion].filter(Boolean).join(" · ");

  return <span className="text-[10px] text-muted-foreground/50 font-mono">{parts}</span>;
}
