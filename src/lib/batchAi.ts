import type { Question } from '../types';
import {
  AI_REQUEST_TIMEOUT_MS,
  toPositionalQuestion,
  type AiReview,
  type AiReviewResult,
} from './ai';
import { displayLabel } from './format';
import { PLACEHOLDER_CORRECT_EXPLANATION, PLACEHOLDER_INCORRECT_EXPLANATION } from './questionBank';
import { snapshotOptions } from './questionForm';
import { sameAnswer } from './scoring';

/** Stop a batch after this many failed requests in a row (bad key, no connection, ...). */
export const MAX_CONSECUTIVE_FAILURES = 3;

export function isMissingExplanation(text: string): boolean {
  const trimmed = text.trim();
  return (
    !trimmed ||
    trimmed === PLACEHOLDER_CORRECT_EXPLANATION ||
    trimmed === PLACEHOLDER_INCORRECT_EXPLANATION
  );
}

/** True when any option has an empty or placeholder explanation. */
export function needsExplanations(question: Question): boolean {
  return question.options.some((option) => isMissingExplanation(option.explanation));
}

/**
 * Fills the missing explanations (and an empty summary) of `question` from an AI review made with
 * positional labels. Returns null, leaving the question alone, when the AI disagrees with the
 * answer key, when the options changed since the review was requested, or when nothing changes.
 * The answer key is never changed.
 */
export function fillExplanationsFromReview(question: Question, review: AiReview): Question | null {
  if (review.optionsSnapshot !== snapshotOptions(question.options.map((option) => option.text))) {
    return null;
  }

  if (!sameAnswer(review.recommendedOptionIds, toPositionalQuestion(question).correctOptionIds)) {
    return null;
  }

  let changed = false;
  const options = question.options.map((option, index) => {
    const aiText = review.optionExplanations[displayLabel(index)]?.trim();

    if (aiText && isMissingExplanation(option.explanation)) {
      changed = true;
      return { ...option, explanation: aiText };
    }

    return option;
  });
  const aiSummary = review.summary.trim();
  const summary = !question.summary.trim() && aiSummary ? aiSummary : question.summary;
  changed ||= summary !== question.summary;

  return changed ? { ...question, options, summary } : null;
}

export type BatchOutcome =
  | { questionId: string; status: 'agreed'; review: AiReview }
  | { questionId: string; status: 'disagreed'; recommended: string[]; current: string[] }
  | { questionId: string; status: 'failed'; error: string };

export type AskFn = (positionalQuestion: Question, signal: AbortSignal) => Promise<AiReviewResult>;

/**
 * Reviews `questions` one at a time and reports each outcome. Labels in `disagreed` outcomes are
 * positional (A = first option). Stops when `signal` aborts, or after
 * MAX_CONSECUTIVE_FAILURES failures in a row; returns whether it stopped for that reason.
 */
export async function runBatchReview(
  questions: Question[],
  ask: AskFn,
  {
    signal,
    onOutcome,
    timeoutMs = AI_REQUEST_TIMEOUT_MS,
  }: { signal: AbortSignal; onOutcome: (outcome: BatchOutcome) => void; timeoutMs?: number },
): Promise<{ stoppedAfterFailures: boolean }> {
  let consecutiveFailures = 0;

  for (const question of questions) {
    if (signal.aborted) {
      break;
    }

    const positional = toPositionalQuestion(question);
    const request = new AbortController();
    const abortRequest = () => request.abort();
    signal.addEventListener('abort', abortRequest);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, timeoutMs);

    try {
      const result = await ask(positional, request.signal);
      consecutiveFailures = 0;

      if (sameAnswer(result.recommendedOptionIds, positional.correctOptionIds)) {
        onOutcome({
          questionId: question.id,
          status: 'agreed',
          review: {
            ...result,
            optionsSnapshot: snapshotOptions(question.options.map((option) => option.text)),
          },
        });
      } else {
        onOutcome({
          questionId: question.id,
          status: 'disagreed',
          recommended: [...result.recommendedOptionIds].sort(),
          current: positional.correctOptionIds,
        });
      }
    } catch (error) {
      if (signal.aborted) {
        break;
      }

      consecutiveFailures += 1;
      onOutcome({
        questionId: question.id,
        status: 'failed',
        error: timedOut
          ? `Timed out after ${Math.round(timeoutMs / 1000)} seconds.`
          : error instanceof Error
            ? error.message
            : 'Request failed.',
      });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return { stoppedAfterFailures: true };
      }
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abortRequest);
    }
  }

  return { stoppedAfterFailures: false };
}
