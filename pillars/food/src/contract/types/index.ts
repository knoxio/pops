/**
 * Public entity types for the food pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { Ingredient } from './ingredient.js';
export type { MealPlan, MealType } from './meal-plan.js';
export type { Recipe } from './recipe.js';
