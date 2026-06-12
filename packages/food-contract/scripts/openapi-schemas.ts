import { z } from 'zod';

import { IngredientSchema } from '../src/schemas/ingredient.js';
import { MealPlanSchema, MealTypeSchema } from '../src/schemas/meal-plan.js';
import { RecipeSchema } from '../src/schemas/recipe.js';
import { refTo, type OpenApiSchema } from './openapi-types.js';

const PAGINATION_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['total', 'limit', 'offset'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    offset: { type: 'integer', minimum: 0 },
    hasMore: { type: 'boolean' },
  },
};

const CreateRecipeBodySchema = z.object({
  name: z.string().min(1),
  ingredients: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  source: z.string().nullable().optional(),
});

const UpdateRecipeBodySchema = CreateRecipeBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Recipe: zodToOpenApiSchema(RecipeSchema),
    MealType: zodToOpenApiSchema(MealTypeSchema),
    MealPlan: zodToOpenApiSchema(MealPlanSchema),
    Ingredient: zodToOpenApiSchema(IngredientSchema),
    CreateRecipeInput: zodToOpenApiSchema(CreateRecipeBodySchema),
    UpdateRecipeInput: zodToOpenApiSchema(UpdateRecipeBodySchema),
    RecipeListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('Recipe') },
        pagination: refTo('Pagination'),
      },
    },
    RecipeResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('Recipe'),
        message: { type: 'string' },
      },
    },
    DeleteResponse: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
  };
}
