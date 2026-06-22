import { describe, expectTypeOf, it } from 'vitest';

import { PILLARS } from '../known-pillar-id.js';

import type { BaseContract, ProcedureShape } from '../base-contract.js';
import type { CallResult } from '../call-result.js';
import type { CallablePillar } from '../callable-pillar.js';
import type { EntitiesOf, ErrorsOf, RoutesOf, SchemasOf } from '../extraction.js';
import type { KnownPillarId } from '../known-pillar-id.js';
import type {
  AiToolNamesOf,
  SearchAdaptersOf,
  SettingsKeysOf,
  UriTypesOf,
} from '../list-projections.js';
import type {
  CallSignature,
  CallSignatureOrThrow,
  InputOf,
  KindOf,
  OutputOf,
} from '../procedure.js';
import type {
  BudgetEntry,
  CreateWishlistInput,
  CreateWishlistOutput,
  EmptyContract,
  GetBudgetInput,
  GetBudgetOutput,
  ListWishlistInput,
  ListWishlistOutput,
  SyntheticContract,
  WishlistItem,
} from './fixtures.js';

describe('BaseContract conformance', () => {
  it('synthetic contract structurally satisfies BaseContract', () => {
    expectTypeOf<SyntheticContract>().toExtend<BaseContract>();
  });

  it('every procedure in the synthetic router satisfies ProcedureShape', () => {
    expectTypeOf<SyntheticContract['router']['wishlist']['list']>().toExtend<ProcedureShape>();
    expectTypeOf<SyntheticContract['router']['wishlist']['create']>().toExtend<ProcedureShape>();
    expectTypeOf<SyntheticContract['router']['budgets']['get']>().toExtend<ProcedureShape>();
  });
});

describe('barrel projections', () => {
  it('RoutesOf lifts the router subtree', () => {
    expectTypeOf<RoutesOf<SyntheticContract>>().toEqualTypeOf<SyntheticContract['router']>();
  });

  it('EntitiesOf lifts the types subtree', () => {
    expectTypeOf<EntitiesOf<SyntheticContract>>().toEqualTypeOf<{
      readonly wishlistItem: WishlistItem;
      readonly budgetEntry: BudgetEntry;
    }>();
  });

  it('SchemasOf lifts the schemas subtree', () => {
    expectTypeOf<SchemasOf<SyntheticContract>>().toEqualTypeOf<SyntheticContract['schemas']>();
  });

  it('ErrorsOf lifts the errors subtree', () => {
    expectTypeOf<ErrorsOf<SyntheticContract>>().toEqualTypeOf<SyntheticContract['errors']>();
  });
});

describe('list-to-union projections', () => {
  it('SearchAdaptersOf collapses adapters list to a string union', () => {
    expectTypeOf<SearchAdaptersOf<SyntheticContract>>().toEqualTypeOf<
      'wishlistAdapter' | 'budgetsAdapter'
    >();
  });

  it('UriTypesOf collapses uri.types to a union', () => {
    expectTypeOf<UriTypesOf<SyntheticContract>>().toEqualTypeOf<
      'finance/wishlist-item' | 'finance/budget'
    >();
  });

  it('SettingsKeysOf collapses settings.keys to a union', () => {
    expectTypeOf<SettingsKeysOf<SyntheticContract>>().toEqualTypeOf<
      'finance.defaultBudgetPeriod' | 'finance.tagSeparator'
    >();
  });

  it('AiToolNamesOf extracts only the tool names, not the full record', () => {
    expectTypeOf<AiToolNamesOf<SyntheticContract>>().toEqualTypeOf<
      'createWishlistItem' | 'listBudgets'
    >();
  });

  it('empty contracts project list-to-union projections to never', () => {
    expectTypeOf<SearchAdaptersOf<EmptyContract>>().toBeNever();
    expectTypeOf<UriTypesOf<EmptyContract>>().toBeNever();
    expectTypeOf<SettingsKeysOf<EmptyContract>>().toBeNever();
    expectTypeOf<AiToolNamesOf<EmptyContract>>().toBeNever();
  });
});

describe('procedure projections', () => {
  type ListProc = SyntheticContract['router']['wishlist']['list'];
  type CreateProc = SyntheticContract['router']['wishlist']['create'];
  type GetBudgetProc = SyntheticContract['router']['budgets']['get'];

  it('InputOf extracts the first declared input', () => {
    expectTypeOf<InputOf<ListProc>>().toEqualTypeOf<ListWishlistInput>();
    expectTypeOf<InputOf<CreateProc>>().toEqualTypeOf<CreateWishlistInput>();
    expectTypeOf<InputOf<GetBudgetProc>>().toEqualTypeOf<GetBudgetInput>();
  });

  it('OutputOf extracts the resolved output', () => {
    expectTypeOf<OutputOf<ListProc>>().toEqualTypeOf<ListWishlistOutput>();
    expectTypeOf<OutputOf<CreateProc>>().toEqualTypeOf<CreateWishlistOutput>();
    expectTypeOf<OutputOf<GetBudgetProc>>().toEqualTypeOf<GetBudgetOutput>();
  });

  it('KindOf distinguishes queries from mutations', () => {
    expectTypeOf<KindOf<ListProc>>().toEqualTypeOf<'query'>();
    expectTypeOf<KindOf<CreateProc>>().toEqualTypeOf<'mutation'>();
  });

  it('CallSignature returns Promise<CallResult<Output>>', () => {
    expectTypeOf<CallSignature<ListProc>>().toEqualTypeOf<
      (input: ListWishlistInput) => Promise<CallResult<ListWishlistOutput>>
    >();
  });

  it('CallSignatureOrThrow returns Promise<Output>', () => {
    expectTypeOf<CallSignatureOrThrow<ListProc>>().toEqualTypeOf<
      (input: ListWishlistInput) => Promise<ListWishlistOutput>
    >();
  });
});

describe('CallablePillar shape', () => {
  type SyntheticCallable = CallablePillar<SyntheticContract>;

  it('mirrors the router tree shape', () => {
    expectTypeOf<keyof SyntheticCallable>().toEqualTypeOf<'wishlist' | 'budgets'>();
    expectTypeOf<keyof SyntheticCallable['wishlist']>().toEqualTypeOf<'list' | 'create'>();
    expectTypeOf<keyof SyntheticCallable['budgets']>().toEqualTypeOf<'get'>();
  });

  it('each procedure is a CallSignature with .orThrow attached', () => {
    expectTypeOf<SyntheticCallable['wishlist']['list']>().toExtend<
      (input: ListWishlistInput) => Promise<CallResult<ListWishlistOutput>>
    >();
    expectTypeOf<SyntheticCallable['wishlist']['list']['orThrow']>().toEqualTypeOf<
      (input: ListWishlistInput) => Promise<ListWishlistOutput>
    >();
  });

  it('empty contracts project to empty callable', () => {
    type EmptyCallable = CallablePillar<EmptyContract>;
    expectTypeOf<keyof EmptyCallable>().toBeNever();
  });
});

describe('CallResult discriminant', () => {
  it('narrows to value only on kind === ok', () => {
    const r = {} as CallResult<WishlistItem>;
    if (r.kind === 'ok') {
      expectTypeOf(r.value).toEqualTypeOf<WishlistItem>();
    }
    if (r.kind === 'unavailable') {
      expectTypeOf(r.pillar).toEqualTypeOf<string>();
    }
    if (r.kind === 'degraded') {
      expectTypeOf(r.reason).toEqualTypeOf<string>();
    }
    if (r.kind === 'contract-mismatch') {
      expectTypeOf(r.expected).toEqualTypeOf<string>();
      expectTypeOf(r.actual).toEqualTypeOf<string>();
    }
    if (r.kind === 'validation-error') {
      expectTypeOf(r.issues).toEqualTypeOf<
        readonly { readonly field: string; readonly reason: string }[]
      >();
    }
  });
});

describe('KnownPillarId', () => {
  it('covers every entry in PILLARS', () => {
    expectTypeOf<KnownPillarId>().toEqualTypeOf<
      'registry' | 'finance' | 'media' | 'inventory' | 'cerebrum' | 'food' | 'lists' | 'contacts'
    >();
  });

  it('PILLARS is a readonly tuple at the value level', () => {
    expectTypeOf(PILLARS).toEqualTypeOf<
      readonly [
        'registry',
        'finance',
        'media',
        'inventory',
        'cerebrum',
        'food',
        'lists',
        'contacts',
      ]
    >();
  });
});
