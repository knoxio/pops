/**
 * Minimal shape every `@pops/<pillar>-contract` package must structurally
 * satisfy. Authored under PRD-155's manifest type generator; consumed here as
 * the type bound for every projection in this module.
 *
 * Contracts are not asked to `implements`/`extends` this interface (TypeScript
 * does not have nominal contract conformance for type aliases anyway). The
 * conformance check is implicit: pass a contract that doesn't structurally
 * satisfy `BaseContract` to any projection and TypeScript errors at the
 * consumer site.
 */
export interface BaseContract {
  readonly pillar: string;
  readonly version: string;
  readonly types: Record<string, unknown>;
  readonly schemas: Record<string, unknown>;
  readonly router: Record<string, Record<string, ProcedureShape>>;
  readonly errors: Record<string, unknown>;
  readonly search: { readonly adapters: readonly string[] };
  readonly ai: {
    readonly tools: readonly {
      readonly name: string;
      readonly description: string;
      readonly parameters: object;
    }[];
  };
  readonly uri: { readonly types: readonly string[] };
  readonly settings: { readonly keys: readonly string[] };
}

/**
 * Structural shape of a tRPC procedure as exposed to projections. The
 * `_def.inputs` array reflects tRPC's chainable `.input(A).input(B)` form;
 * projections consume `inputs[0]` to give the consumer-facing single-arg
 * shape. `_def.output` carries the resolved return type. `_def.kind`
 * discriminates queries from mutations from subscriptions; only `query` and
 * `mutation` are projected today — subscription wiring lands when the wire
 * transport does (Theme 13 / out of scope for PRD-160).
 */
export interface ProcedureShape {
  readonly _def: {
    readonly inputs: readonly unknown[];
    readonly output: unknown;
    readonly kind: 'query' | 'mutation' | 'subscription';
  };
}
