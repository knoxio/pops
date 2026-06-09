/**
 * Shape of the server-side rows the mock returns. Mirrors what
 * `food.aliases.listWithTargets` actually produces over the wire.
 */
export interface AliasIngredientTarget {
  readonly kind: 'ingredient';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

export interface AliasVariantTarget {
  readonly kind: 'variant';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly parentIngredientSlug: string;
  readonly parentIngredientName: string;
}

export interface AliasWithTargetServer {
  readonly alias: {
    readonly id: number;
    readonly alias: string;
    readonly source: 'user' | 'llm' | 'ingest';
    readonly createdAt: string;
  };
  readonly target: AliasIngredientTarget | AliasVariantTarget;
}

export interface SlugSearchHit {
  readonly slug: string;
  readonly kind: 'ingredient';
  readonly targetId: number;
  readonly name: string;
}
