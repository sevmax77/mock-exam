import { useEffect, useRef, useState } from 'react';
import type { Question } from '../types';
import { askOpenRouter, type AiReview, type AiSettings } from '../lib/ai';
import { MAX_CONSECUTIVE_FAILURES, runBatchReview, type BatchOutcome } from '../lib/batchAi';

export type BatchState = {
  running: boolean;
  total: number;
  outcomes: BatchOutcome[];
  /** Why the batch ended before the last question, if it did. */
  stopReason: string | null;
};

/**
 * Runs one batch Ask AI at a time. It lives in App, so it keeps going while the user moves
 * between screens. Each agreeing review is handed to `onAgreed` as soon as it arrives, so
 * cancelling keeps the work done so far.
 */
export function useBatchAskAi() {
  const [state, setState] = useState<BatchState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = async (
    questions: Question[],
    settings: AiSettings,
    onAgreed: (questionId: string, review: AiReview) => void,
  ) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ running: true, total: questions.length, outcomes: [], stopReason: null });

    const { stoppedAfterFailures } = await runBatchReview(
      questions,
      (question, signal) => askOpenRouter(question, settings, signal),
      {
        signal: controller.signal,
        onOutcome: (outcome) => {
          if (controllerRef.current !== controller) {
            return;
          }

          if (outcome.status === 'agreed') {
            onAgreed(outcome.questionId, outcome.review);
          }

          setState(
            (current) => current && { ...current, outcomes: [...current.outcomes, outcome] },
          );
        },
      },
    );

    if (controllerRef.current !== controller) {
      return;
    }

    controllerRef.current = null;
    setState(
      (current) =>
        current && {
          ...current,
          running: false,
          stopReason: stoppedAfterFailures
            ? `Stopped after ${MAX_CONSECUTIVE_FAILURES} failed requests in a row. Check the API key, model and connection.`
            : controller.signal.aborted
              ? 'Cancelled.'
              : null,
        },
    );
  };

  return {
    state,
    start,
    cancel: () => controllerRef.current?.abort(),
    dismiss: () => setState(null),
  };
}
