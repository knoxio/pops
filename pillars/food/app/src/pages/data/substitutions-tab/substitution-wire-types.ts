/** Wire-derived hydrated substitution shapes from the substitutions REST surface. */
import type { SubstitutionsListHydratedResponses } from '../../../food-api/types.gen.js';

export type HydratedSubstitutionView = SubstitutionsListHydratedResponses[200]['items'][number];
export type HydratedEndpoint = HydratedSubstitutionView['from'];
