/**
 * Side-effect module that registers media search ResultComponents.
 * Import this module to register the movies and tv-shows ResultComponents.
 */
import { registerResultComponent } from '@pops/navigation';

import { MovieSearchResult } from './MovieSearchResult';
import { TvShowSearchResult } from './TvShowSearchResult';

registerResultComponent('movies', MovieSearchResult);
registerResultComponent('tv-shows', TvShowSearchResult);
