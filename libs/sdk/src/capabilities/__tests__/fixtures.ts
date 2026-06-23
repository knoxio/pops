import type { BaseContract, ProcedureShape } from '../base-contract.js';

export type WishlistItem = {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
};

export type BudgetEntry = {
  readonly id: string;
  readonly periodStart: string;
  readonly limitCents: number;
};

export type ListWishlistInput = { readonly cursor?: string; readonly limit?: number };
export type ListWishlistOutput = readonly WishlistItem[];

export type CreateWishlistInput = { readonly name: string; readonly priceCents: number };
export type CreateWishlistOutput = WishlistItem;

export type GetBudgetInput = { readonly id: string };
export type GetBudgetOutput = BudgetEntry;

type Query<Input, Output> = {
  readonly _def: {
    readonly inputs: readonly [Input];
    readonly output: Output;
    readonly kind: 'query';
  };
};

type Mutation<Input, Output> = {
  readonly _def: {
    readonly inputs: readonly [Input];
    readonly output: Output;
    readonly kind: 'mutation';
  };
};

export type SyntheticContract = {
  readonly pillar: 'finance';
  readonly version: '1.2.3';
  readonly types: {
    readonly wishlistItem: WishlistItem;
    readonly budgetEntry: BudgetEntry;
  };
  readonly schemas: {
    readonly wishlistItem: { readonly tag: 'zod-schema' };
    readonly budgetEntry: { readonly tag: 'zod-schema' };
  };
  readonly router: {
    readonly wishlist: {
      readonly list: Query<ListWishlistInput, ListWishlistOutput>;
      readonly create: Mutation<CreateWishlistInput, CreateWishlistOutput>;
    };
    readonly budgets: {
      readonly get: Query<GetBudgetInput, GetBudgetOutput>;
    };
  };
  readonly errors: {
    readonly BudgetExceeded: { readonly code: 'BUDGET_EXCEEDED' };
    readonly NotFound: { readonly code: 'NOT_FOUND' };
  };
  readonly search: {
    readonly adapters: readonly ['wishlistAdapter', 'budgetsAdapter'];
  };
  readonly ai: {
    readonly tools: readonly [
      {
        readonly name: 'createWishlistItem';
        readonly description: 'Add a wishlist item';
        readonly parameters: { readonly type: 'object' };
      },
      {
        readonly name: 'listBudgets';
        readonly description: 'List budgets';
        readonly parameters: { readonly type: 'object' };
      },
    ];
  };
  readonly uri: {
    readonly types: readonly ['finance/wishlist-item', 'finance/budget'];
  };
  readonly settings: {
    readonly keys: readonly ['finance.defaultBudgetPeriod', 'finance.tagSeparator'];
  };
};

type AssertContractConforms = SyntheticContract extends BaseContract ? true : false;
type AssertProcedureConforms =
  SyntheticContract['router']['wishlist']['list'] extends ProcedureShape ? true : false;
export const contractConforms: AssertContractConforms = true;
export const procedureConforms: AssertProcedureConforms = true;

export type EmptyContract = {
  readonly pillar: 'registry';
  readonly version: '0.0.0';
  readonly types: Record<never, never>;
  readonly schemas: Record<never, never>;
  readonly router: Record<never, never>;
  readonly errors: Record<never, never>;
  readonly search: { readonly adapters: readonly [] };
  readonly ai: { readonly tools: readonly [] };
  readonly uri: { readonly types: readonly [] };
  readonly settings: { readonly keys: readonly [] };
};
