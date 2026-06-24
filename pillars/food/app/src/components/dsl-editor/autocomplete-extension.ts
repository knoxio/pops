/**
 * DSL editor autocomplete — CodeMirror extension factory.
 *
 * Returns an `Extension[]` to be merged into the editor state. The
 * extension is built once per `DslEditor` mount and never reconfigured
 * — `useDslEditorView` swaps the *sources* through a stable closure so
 * each call sees the latest props without re-creating the extension
 * compartment.
 *
 * `closeOnBlur` and `activateOnTyping` are set explicitly (rather than
 * relying on @codemirror/autocomplete's defaults) so version drift in the
 * dependency can't silently change the behaviour.
 *
 * The `tooltipClass` marker lets the bottom-drawer CSS rules in
 * `dslAutocompleteTheme` re-anchor the popup to the viewport floor on
 * screens narrower than 768px.
 */
import { autocompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

import { buildDslCompletionSource } from './autocomplete-source';

import type { Extension } from '@codemirror/state';

import type { DslAutocompleteSources } from './autocomplete-types';

export const DSL_AUTOCOMPLETE_TOOLTIP_CLASS = 'dsl-editor-autocomplete';

export const dslAutocompleteTheme = EditorView.baseTheme({
  [`.cm-tooltip-autocomplete.${DSL_AUTOCOMPLETE_TOOLTIP_CLASS}`]: {
    maxHeight: '14rem',
  },
  [`@media (max-width: 767px)`]: {
    [`.cm-tooltip.cm-tooltip-autocomplete.${DSL_AUTOCOMPLETE_TOOLTIP_CLASS}`]: {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      top: 'auto',
      maxHeight: '50vh',
      width: '100vw',
      borderRadius: '12px 12px 0 0',
      borderWidth: '1px 0 0 0',
      boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.18)',
      zIndex: '50',
    },
    [`.cm-tooltip.cm-tooltip-autocomplete.${DSL_AUTOCOMPLETE_TOOLTIP_CLASS} > ul`]: {
      maxHeight: '50vh',
      fontSize: '1rem',
    },
    [`.cm-tooltip.cm-tooltip-autocomplete.${DSL_AUTOCOMPLETE_TOOLTIP_CLASS} > ul > li`]: {
      padding: '12px 16px',
      minHeight: '44px',
      display: 'flex',
      alignItems: 'center',
    },
  },
});

export function dslAutocompletion(sources: DslAutocompleteSources): Extension {
  return [
    autocompletion({
      activateOnTyping: true,
      closeOnBlur: true,
      override: [buildDslCompletionSource(sources)],
      tooltipClass: () => DSL_AUTOCOMPLETE_TOOLTIP_CLASS,
    }),
    dslAutocompleteTheme,
  ];
}
