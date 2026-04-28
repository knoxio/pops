/**
 * Low-level SSE streaming hook for ego chat (PRD-087 US-01 AC #6).
 *
 * Fetches from the /api/ego/chat/stream SSE endpoint and processes
 * the event stream, updating state as tokens arrive.
 */
import { useCallback, useRef, useState } from 'react';

import type { RetrievedEngram } from './types';

/** SSE token event from /api/ego/chat/stream. */
interface SseTokenEvent {
  type: 'token';
  text: string;
}

/** SSE done event from /api/ego/chat/stream. */
interface SseDoneEvent {
  type: 'done';
  conversationId: string;
  messageId: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  retrievedEngrams: RetrievedEngram[];
}

/** SSE error event from /api/ego/chat/stream. */
interface SseErrorEvent {
  type: 'error';
  message: string;
}

type SseEvent = SseTokenEvent | SseDoneEvent | SseErrorEvent;

/** Parse an SSE data line into a typed event object. */
function parseSseEvent(line: string): SseEvent | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6)) as SseEvent;
  } catch {
    return null;
  }
}

interface StreamChatParams {
  conversationId: string | null;
  message: string;
}

interface StreamCallbacks {
  onConversation: (id: string) => void;
  onEngrams: (engrams: RetrievedEngram[]) => void;
  onInvalidate: (conversationId: string) => void;
}

/** Process the SSE response body, dispatching events to state setters. */
async function processStream(
  body: ReadableStream<Uint8Array>,
  setContent: React.Dispatch<React.SetStateAction<string | null>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = parseSseEvent(trimmed);
      if (!event) continue;

      if (event.type === 'token') {
        setContent((prev) => (prev ?? '') + event.text);
      } else if (event.type === 'done') {
        callbacks.onConversation(event.conversationId);
        callbacks.onEngrams(event.retrievedEngrams);
        setContent(null);
        callbacks.onInvalidate(event.conversationId);
      } else if (event.type === 'error') {
        setError(event.message);
        setContent(null);
      }
    }
  }
}

export interface UseStreamingChatReturn {
  /** Start streaming a message to the SSE endpoint. */
  stream: (params: StreamChatParams, callbacks: StreamCallbacks) => void;
  /** Whether a stream is currently active. */
  isStreaming: boolean;
  /** Error from the last stream attempt. */
  error: string | null;
  /** Partial streaming content (null when not streaming). */
  streamingContent: string | null;
  /** Clear the error state. */
  clearError: () => void;
}

export function useStreamingChat(): UseStreamingChatReturn {
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    (params: StreamChatParams, callbacks: StreamCallbacks) => {
      if (isStreaming) return;

      setIsStreaming(true);
      setError(null);
      setStreamingContent('');

      const controller = new AbortController();
      abortRef.current = controller;

      fetch('/api/ego/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: params.conversationId ?? undefined,
          message: params.message,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Stream request failed: ${response.status}`);
          if (!response.body) throw new Error('Response body is null');
          await processStream(response.body, setStreamingContent, setError, callbacks);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Stream failed');
          setStreamingContent(null);
        })
        .finally(() => {
          setIsStreaming(false);
          abortRef.current = null;
        });
    },
    [isStreaming]
  );

  const clearError = useCallback(() => setError(null), []);

  return { stream, isStreaming, error, streamingContent, clearError };
}
