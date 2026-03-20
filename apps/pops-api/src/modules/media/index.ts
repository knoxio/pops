/**
 * Media domain — movies, tv shows, comparisons, watchlist, watch history.
 */
import { router } from "../../trpc.js";
import { moviesRouter } from "./movies/router.js";
import { comparisonsRouter } from "./comparisons/index.js";
import { watchlistRouter } from "./watchlist/router.js";

export const mediaRouter = router({
  movies: moviesRouter,
  comparisons: comparisonsRouter,
  watchlist: watchlistRouter,
});
