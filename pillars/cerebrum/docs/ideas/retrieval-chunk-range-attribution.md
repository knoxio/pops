# Idea: multi-chunk range attribution in context assembly

## Problem

`SourceAttribution` already declares an optional `chunkRange?: [number, number]` field in the retrieval wire schema, but nothing populates it. Context assembly currently emits one section per source from a single deduped chunk preview, so a multi-chunk engram is represented by whichever chunk the semantic leg matched, and the caller has no way to know which span of the source was actually included. The field is dead weight today.

## Build later

- When an engram (or any multi-chunk source) contributes more than one chunk to an assembled context, stitch the contiguous chunks together and set `chunkRange: [firstChunkIndex, lastChunkIndex]` on its `SourceAttribution` so the LLM can cite the exact span.
- Decide a packing policy: greedily include adjacent chunks of an already-selected source before moving to the next source, vs. strictly relevance-ordered chunk interleaving. The former gives cleaner ranges; the latter maximises diversity under the token budget.
- Surface the chunk body (not just the 200-char `content_preview`) for the included range, since the preview is a lossy stand-in for the real content. This depends on the assembler being able to read full chunk text — today it only has the preview that rides on the k-NN row.

## Notes

- Low priority — no consumer requires `chunkRange` yet; the field is forward-looking. Until then, leaving it unset is correct, not a bug.
- Touches only `context-assembly.ts` and the semantic k-NN row shape (it would need to carry `chunk_index` through to assembly, which `VectorRow` already has but the deduped result drops).
