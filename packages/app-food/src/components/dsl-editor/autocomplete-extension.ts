/**
 * DSL editor autocomplete — CodeMirror extension factory (PRD-120 part B).
 *
 * Returns an `Extension[]` to be merged into the editor state. The
 * extension is built once per `DslEditor` mount and never reconfigured
 * — `useDslEditorView` swaps the *sources* through a stable closure so
 * each call sees the latest props without re-creating the extension
 * compartment.
 *
 * `closeOnBlur` defaults to `true` so clicking outside the editor
 * dismisses the popup; `activateOnTyping` defaults to `true` so the
 * source fires as the user types without needing Ctrl-Space. The
 * defaults are explicit here so future debugging doesn't blame
 * @codemirror/autocomplete's release-version drift.
 */
import { autocompletion } from '@codemirror/autocomplete';

import { buildDslCompletionSource } from './autocomplete-source';

import type { Extension } from '@codemirror/state';

import type { DslAutocompleteSources } from './autocomplete-types';

export function dslAutocompletion(sources: DslAutocompleteSources): Extension {
  return autocompletion({
    activateOnTyping: true,
    closeOnBlur: true,
    override: [buildDslCompletionSource(sources)],
  });
}
