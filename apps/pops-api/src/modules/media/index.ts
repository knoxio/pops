/**
 * Media domain — movies, tv shows, watchlist, watch history.
 */
import { router } from "../../trpc.js";
import { moviesRouter } from "./movies/router.js";
import { watchlistRouter } from "./watchlist/router.js";
import { watchHistoryRouter } from "./watch-history/router.js";

export const mediaRouter = router({
  movies: moviesRouter,
  watchlist: watchlistRouter,
  watchHistory: watchHistoryRouter,
});
