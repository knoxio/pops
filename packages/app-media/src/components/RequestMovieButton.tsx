/**
 * RequestMovieButton — requests a movie via Radarr.
 *
 * Hidden when the movie already exists in Radarr.
 * Disabled when Radarr is not configured.
 * Returns null on query error (service unreachable).
 */
import { Button } from "@pops/ui";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

type ButtonVariant = "standard" | "compact";

export interface RequestMovieButtonProps {
  tmdbId: number;
  title: string;
  variant?: ButtonVariant;
  onRequest?: (tmdbId: number) => void;
}

export function RequestMovieButton({
  tmdbId,
  title,
  variant = "standard",
  onRequest,
}: RequestMovieButtonProps) {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: config?.radarrConfigured === true }
  );

  // Not configured — show disabled button
  if (!config?.radarrConfigured) {
    if (variant === "compact") {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          disabled
          title="Radarr not configured"
          aria-label="Request movie (Radarr not configured)"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" disabled title="Radarr not configured">
        <Download className="h-4 w-4" />
        Request
      </Button>
    );
  }

  // Loading — show spinner
  if (movieStatus.isLoading) return null;

  // Error — hide entirely (service unreachable)
  if (movieStatus.error) return null;

  // Movie exists in Radarr — hide button
  const status = movieStatus.data?.data?.status;
  if (status && status !== "not_found") return null;

  const handleClick = () => {
    if (onRequest) {
      onRequest(tmdbId);
    } else {
      toast.info(`Request "${title}" — modal coming soon`);
    }
  };

  if (variant === "compact") {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-white hover:bg-white/20"
        onClick={handleClick}
        title="Request in Radarr"
        aria-label="Request in Radarr"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Download className="h-4 w-4" />
      Request
    </Button>
  );
}
