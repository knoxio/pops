# Idea: Recipe Renderer Extensions

Status: **Idea** — not built. The `RecipeRenderer` (`pillars/food/app/src/components/RecipeRenderer.tsx`) ships the full detail + compact cookbook view with two-pass step substitution, scaling, and `onTimerStart`. The items below were specced for the renderer but are absent from the component, its props, its derivation helpers, and its test/a11y setup.

## Proposed scope

1. **`onTimerStop` + cooking-mode integration point.**
   - Add `onTimerStop?: (stepPosition: number) => void` to `RecipeRendererProps` and a stop affordance on `TimerButton`. The renderer stays stateless (fire-and-forget); the running-timer state lives in the consumer.
   - Build the actual cooking-mode surface that owns timer state: large hands-free text, ambient-noise resistance, per-step timer lifecycle. The renderer's `onTimerStart` / `onTimerStop` callbacks are the integration seam — cooking mode passes `scaleFactor` (0.5 / 2 / …) through the existing prop.

2. **Renderer-owned "card" middle size.**
   - The storage layer already generates `hero-card.webp` (640px) alongside `hero-thumb.webp` (320px), but the renderer only consumes the thumb in `variant='compact'`. Add a third size (e.g. `variant='card'`) that uses `hero-card.webp` for list surfaces that want more than the compact row — recipe lists, "what can I cook tonight" results (Epic 06), search results — with a `<img onError>` fallback to the full hero when the derivative 404s.

3. **Automated axe-core a11y sweep.**
   - Wire an `axe-core` run over rendered `RecipeRenderer` output for both variants (the DSL editor already has `DslEditor.accessibility.test.tsx` as the pattern). Today the renderer's accessibility is asserted only structurally (aria-labels, semantic HTML, theme tokens), not via an automated rule sweep.

4. **Full parser-corpus round-trip parity.**
   - The current `RecipeRenderer.parity.test.tsx` exercises the compile → render loop against 2 local fixtures. Replace/extend with the full DSL parser sample set (`src/dsl/__tests__/samples.ts`, each compiled via `compileRecipeVersion` from `src/dsl/compile.ts`, then rendered, then snapshot-asserted) once that gating sample corpus is wired here, to catch divergence between the compiler's `bodyMd` rewriting rules and the renderer's anchor substitution.

5. **Renderer-side niceties (deferred from the original spec).**
   - Printable / PDF view, share/export to other formats, an image carousel (multiple images per recipe vs the single hero), and recipe ratings / social proof — all out of scope for v1 and unbuilt.

## Constraints to preserve

- The renderer must stay pure presentation: no fetching, no DB access, no internal timer state. Any new callback is fire-and-forget; the consumer owns state.
- Scaling stays display-only and multiplicative on quantities only — never on time or temperature.
- All new copy goes through `useTranslation('food')` against `libs/locales/en-AU/food.json`; colour stays on `@pops/ui` theme tokens only.
- The renderer never reads `body_dsl`; structure always comes from `bodyResolvedJson`, text from `bodyMd`.
