import { useState } from "react";
import { Button, DateInput } from "@pops/ui";
import { Eye, CircleCheck, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

export interface MarkAsWatchedButtonProps {
  mediaId: number;
  className?: string;
}

export function MarkAsWatchedButton({
  mediaId,
  className,
}: MarkAsWatchedButtonProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const utils = trpc.useUtils();

  const { data: historyData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: "movie", mediaId, limit: 100 },
    { staleTime: 30_000 },
  );

  const watchCount = historyData?.data?.length ?? 0;
  const lastWatched = historyData?.data?.[0]?.watchedAt;

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      toast.success("Marked as watched");
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();
      setShowDatePicker(false);
      setCustomDate("");
    },
    onError: (err) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
  });

  const handleMarkWatched = () => {
    logMutation.mutate({
      mediaType: "movie",
      mediaId,
      completed: 1,
    });
  };

  const handleMarkWatchedWithDate = () => {
    if (!customDate) return;
    logMutation.mutate({
      mediaType: "movie",
      mediaId,
      watchedAt: new Date(customDate).toISOString(),
      completed: 1,
    });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkWatched}
          loading={logMutation.isPending && !showDatePicker}
          loadingText="Logging"
          prefix={
            watchCount > 0 ? (
              <CircleCheck className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )
          }
          aria-label="Mark as watched"
        >
          {watchCount > 0 ? `Watched (${watchCount})` : "Mark as Watched"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowDatePicker(!showDatePicker)}
          aria-label="Pick custom watch date"
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
      </div>

      {showDatePicker && (
        <div className="flex items-center gap-2 mt-2">
          <DateInput
            size="sm"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            aria-label="Watch date"
          />
          <Button
            variant="default"
            size="sm"
            onClick={handleMarkWatchedWithDate}
            disabled={!customDate}
            loading={logMutation.isPending && showDatePicker}
            loadingText="Logging"
          >
            Log
          </Button>
        </div>
      )}

      {watchCount > 0 && lastWatched && (
        <p className="text-xs text-muted-foreground mt-1">
          Last watched {formatDate(lastWatched)}
        </p>
      )}
    </div>
  );
}
