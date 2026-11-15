import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';
import { makeQuestion } from '../test/fixtures';
import type { AiReview, AiReviewResult } from './ai';
import {
  MAX_CONSECUTIVE_FAILURES,
  fillExplanationsFromReview,
  isMissingExplanation,
  needsExplanations,
  runBatchReview,
  type AskFn,
  type BatchOutcome,
} from './batchAi';
import { PLACEHOLDER_CORRECT_EXPLANATION, PLACEHOLDER_INCORRECT_EXPLANATION } from './questionBank';
import { snapshotOptions } from './questionForm';

/** Options B and D stored out of order: positional label A = stored B, label B = stored D. */
function pendingQuestion(): Question {
  return {
    id: 'q1',
    question: 'Which?',
    options: [
      { id: 'B', text: 'first', explanation: PLACEHOLDER_INCORRECT_EXPLANATION },
      { id: 'D', text: 'second', explanation: '' },
      { id: 'A', text: 'third', explanation: 'Kept as written.' },
    ],
    correctOptionIds: ['D'],
    summary: '',
  };
}

function review(overrides: Partial<AiReview> = {}): AiReview {
  return {
    optionsSnapshot: snapshotOptions(['first', 'second', 'third']),
    recommendedOptionIds: ['B'],
    confidence: 'high',
    optionExplanations: { A: 'AI on first', B: 'AI on second', C: 'AI on third' },
    summary: 'AI summary',
    notes: '',
    ...overrides,
  };
}

describe('missing explanations', () => {
  it('treats empty and placeholder text as missing', () => {
    expect(isMissingExplanation('  ')).toBe(true);
    expect(isMissingExplanation(` ${PLACEHOLDER_CORRECT_EXPLANATION} `)).toBe(true);
    expect(isMissingExplanation(PLACEHOLDER_INCORRECT_EXPLANATION)).toBe(true);
    expect(isMissingExplanation('Real text.')).toBe(false);
  });

  it('finds questions with any missing explanation', () => {
    expect(needsExplanations(pendingQuestion())).toBe(true);
    expect(needsExplanations(makeQuestion('q2'))).toBe(false);
  });
});

describe('fillExplanationsFromReview', () => {
  it('fills only missing explanations and an empty summary, keeping the answer', () => {
    const filled = fillExplanationsFromReview(pendingQuestion(), review());

    expect(filled?.options.map((option) => option.explanation)).toEqual([
      'AI on first',
      'AI on second',
      'Kept as written.',
    ]);
    expect(filled?.summary).toBe('AI summary');
    expect(filled?.correctOptionIds).toEqual(['D']);
  });

  it('keeps an existing summary', () => {
    const question = { ...pendingQuestion(), summary: 'Mine' };
    expect(fillExplanationsFromReview(question, review())?.summary).toBe('Mine');
  });

  it('refuses when the AI disagrees with the answer key', () => {
    expect(fillExplanationsFromReview(pendingQuestion(), review({ recommendedOptionIds: ['A'] }))).toBeNull();
  });

  it('refuses when the options changed since the request', () => {
    const changed = review({ optionsSnapshot: snapshotOptions(['first', 'edited', 'third']) });
    expect(fillExplanationsFromReview(pendingQuestion(), changed)).toBeNull();
  });

  it('returns null when there is nothing to fill', () => {
    const done = { ...makeQuestion('q2', ['A'], ['first', 'second']), summary: 'S' };
    const agreeing = review({
      optionsSnapshot: snapshotOptions(['first', 'second']),
      recommendedOptionIds: ['A'],
    });
    expect(fillExplanationsFromReview(done, agreeing)).toBeNull();
  });
});

describe('runBatchReview', () => {
  const result = (recommendedOptionIds: string[]): AiReviewResult => ({
    recommendedOptionIds,
    confidence: 'high',
    optionExplanations: { A: 'a', B: 'b' },
    summary: '',
    notes: '',
  });
  const questions = ['q1', 'q2', 'q3', 'q4'].map((id) => makeQuestion(id, ['B'], ['x', 'y']));

  async function run(ask: AskFn, signal = new AbortController().signal) {
    const outcomes: BatchOutcome[] = [];
    const end = await runBatchReview(questions, ask, {
      signal,
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    return { outcomes, ...end };
  }

  it('reports agreement, disagreement and failures, one question at a time', async () => {
    const ask = vi.fn<AskFn>(async (question) => {
      if (question.id === 'q2') return result(['A']);
      if (question.id === 'q3') throw new Error('rate limited');
      return result(['B']);
    });
    const { outcomes, stoppedAfterFailures } = await run(ask);

    expect(stoppedAfterFailures).toBe(false);
    expect(outcomes.map((outcome) => [outcome.questionId, outcome.status])).toEqual([
      ['q1', 'agreed'],
      ['q2', 'disagreed'],
      ['q3', 'failed'],
      ['q4', 'agreed'],
    ]);
    expect(outcomes[1]).toMatchObject({ recommended: ['A'], current: ['B'] });
    expect(outcomes[2]).toMatchObject({ error: 'rate limited' });
    expect(outcomes[0]).toMatchObject({
      review: { optionsSnapshot: snapshotOptions(['x', 'y']), recommendedOptionIds: ['B'] },
    });
  });

  it('stops after repeated failures in a row', async () => {
    const ask = vi.fn<AskFn>(async () => {
      throw new Error('401');
    });
    const { outcomes, stoppedAfterFailures } = await run(ask);

    expect(stoppedAfterFailures).toBe(true);
    expect(outcomes).toHaveLength(MAX_CONSECUTIVE_FAILURES);
  });

  it('stops quietly when cancelled', async () => {
    const controller = new AbortController();
    const ask = vi.fn<AskFn>(async (question, signal) => {
      if (question.id === 'q2') {
        controller.abort();
        expect(signal.aborted).toBe(true);
        throw new Error('aborted');
      }
      return result(['B']);
    });
    const { outcomes, stoppedAfterFailures } = await run(ask, controller.signal);

    expect(stoppedAfterFailures).toBe(false);
    expect(outcomes.map((outcome) => outcome.questionId)).toEqual(['q1']);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled request and moves on', async () => {
    const ask = vi.fn<AskFn>(
      (question, signal) =>
        new Promise((resolve, reject) => {
          if (question.id !== 'q1') {
            resolve(result(['B']));
            return;
          }
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const outcomes: BatchOutcome[] = [];
    await runBatchReview(questions, ask, {
      signal: new AbortController().signal,
      onOutcome: (outcome) => outcomes.push(outcome),
      timeoutMs: 10,
    });

    expect(outcomes[0]).toMatchObject({ status: 'failed', error: 'Timed out after 0 seconds.' });
    expect(outcomes.slice(1).every((outcome) => outcome.status === 'agreed')).toBe(true);
  });
});
