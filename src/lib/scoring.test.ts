import { describe, expect, it } from 'vitest';
import type { SavedExamState } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap } from './questionBank';
import { displayAnswer, getScore, sameAnswer, scorePercentage } from './scoring';

describe('sameAnswer', () => {
  it('ignores order', () => {
    expect(sameAnswer(['C', 'A'], ['A', 'C'])).toBe(true);
  });

  it('rejects partial, extra and different answers', () => {
    expect(sameAnswer(['A'], ['A', 'C'])).toBe(false);
    expect(sameAnswer(['A', 'B', 'C'], ['A', 'C'])).toBe(false);
    expect(sameAnswer(['B'], ['A'])).toBe(false);
  });

  it('does not mutate its inputs', () => {
    const selected = ['C', 'A'];
    sameAnswer(selected, ['A', 'C']);
    expect(selected).toEqual(['C', 'A']);
  });
});

describe('displayAnswer', () => {
  it('uses the shown position, not the option id', () => {
    expect(displayAnswer(['A'], ['C', 'A', 'B'])).toBe('B');
    expect(displayAnswer(['A', 'C'], ['C', 'A', 'B'])).toBe('A, B');
  });

  it('handles no answer and unknown ids', () => {
    expect(displayAnswer([], ['A', 'B'])).toBe('No answer');
    expect(displayAnswer(['Z', 'B'], ['A', 'B'])).toBe('B');
  });
});

describe('getScore', () => {
  const questions = [makeQuestion('q1', ['A']), makeQuestion('q2', ['B', 'D']), makeQuestion('q3')];
  const session: SavedExamState = {
    mode: 'exam',
    startedAt: '2026-01-01T00:00:00.000Z',
    questionOrder: ['q2', 'q1', 'q3'],
    optionOrders: { q1: ['D', 'C', 'B', 'A'] },
    currentIndex: 0,
    selections: { q1: ['A'], q2: ['D', 'B'] },
    submittedQuestionIds: [],
    flaggedQuestionIds: [],
  };

  it('scores every question in session order by default', () => {
    const score = getScore(session, buildQuestionMap(questions));
    expect(score.results.map((result) => [result.questionId, result.isCorrect])).toEqual([
      ['q2', true],
      ['q1', true],
      ['q3', false],
    ]);
    expect(score.correctCount).toBe(2);
    expect(score.wrongCount).toBe(1);
  });

  it('records the shown option order, falling back to the bank order', () => {
    const score = getScore(session, buildQuestionMap(questions));
    expect(score.results.find((result) => result.questionId === 'q1')?.optionOrder).toEqual([
      'D',
      'C',
      'B',
      'A',
    ]);
    expect(score.results.find((result) => result.questionId === 'q3')?.optionOrder).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('scores only the given question ids', () => {
    const score = getScore(session, buildQuestionMap(questions), ['q3']);
    expect(score.results).toHaveLength(1);
    expect(score.correctCount).toBe(0);
  });
});

describe('scorePercentage', () => {
  it('rounds and handles empty attempts', () => {
    const attempt = { totalQuestions: 3, correctCount: 2 } as Parameters<typeof scorePercentage>[0];
    expect(scorePercentage(attempt)).toBe(67);
    expect(scorePercentage({ ...attempt, totalQuestions: 0, correctCount: 0 })).toBe(0);
  });
});
