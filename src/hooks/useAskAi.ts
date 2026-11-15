import { useEffect, useRef, useState } from 'react';
import type { Question } from '../types';
import {
  AI_REQUEST_TIMEOUT_MS,
  askOpenRouter,
  toPositionalQuestion,
  type AiReview,
  type AiSettings,
  type AiStatus,
} from '../lib/ai';

const IDLE: AiStatus = { loading: false, error: null };

/**
 * One Ask AI request at a time. A newer request, `cancel()` or unmounting aborts the previous
 * one, and replies from aborted requests are ignored.
 */
export function useAskAi() {
  const [status, setStatus] = useState<AiStatus>(IDLE);
  const [review, setReview] = useState<AiReview | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const cancel = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setReview(null);
    setStatus(IDLE);
  };

  /** `optionsSnapshot` is stored with the review so it is not applied to changed options. */
  const ask = async (question: Question, settings: AiSettings, optionsSnapshot: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AI_REQUEST_TIMEOUT_MS);

    setStatus({ loading: true, error: null });
    setReview(null);

    try {
      const result = await askOpenRouter(
        toPositionalQuestion(question),
        settings,
        controller.signal,
      );

      // Ignore the reply if the user opened another question or left the form meanwhile.
      if (requestRef.current !== controller) {
        return;
      }

      setReview({ ...result, optionsSnapshot });
      setStatus(IDLE);
    } catch (error) {
      if (requestRef.current !== controller) {
        return;
      }

      setStatus({
        loading: false,
        error: timedOut
          ? `Ask AI timed out after ${AI_REQUEST_TIMEOUT_MS / 1000} seconds. Try again or pick a faster model.`
          : error instanceof Error
            ? error.message
            : 'Ask AI failed.',
      });
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  };

  return {
    status,
    review,
    ask,
    cancel,
    setError: (error: string) => setStatus({ loading: false, error }),
    dismissReview: () => setReview(null),
  };
}
