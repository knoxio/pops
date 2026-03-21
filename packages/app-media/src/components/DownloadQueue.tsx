import { Badge } from "@pops/ui";
import { trpc } from "../lib/trpc";

export function DownloadQueue() {
  const { data } = trpc.media.arr.getDownloadQueue.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const items = data?.data ?? [];

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Downloading</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] uppercase tracking-wider"
            >
              {item.mediaType === "movie" ? "Movie" : "Episode"}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {item.statusLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
