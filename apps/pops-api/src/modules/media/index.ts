/**
 * Media domain — movies, tv shows, comparisons, watchlist, watch history.
 */
import { router } from "../../trpc.js";
import { moviesRouter } from "./movies/router.js";
import { tvShowsRouter } from "./tv-shows/index.js";
import { comparisonsRouter } from "./comparisons/index.js";
import { watchlistRouter } from "./watchlist/router.js";
import { watchHistoryRouter } from "./watch-history/router.js";
import { libraryRouter } from "./library/index.js";

export const mediaRouter = router({
  movies: moviesRouter,
  tvShows: tvShowsRouter,
  comparisons: comparisonsRouter,
  watchlist: watchlistRouter,
  watchHistory: watchHistoryRouter,
  library: libraryRouter,
});
